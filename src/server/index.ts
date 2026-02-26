import { createServer } from "node:http";
import { URL } from "node:url";
import { JsonStore } from "./storage/jsonStore.ts";
import { RULESET_VERSION } from "../core/types.ts";
import type { CreatureSpec, Move } from "../core/types.ts";
import type { LeaderboardMetric, LeaderboardScope } from "./economy/leaderboards.ts";
import type { Side } from "./storage/types.ts";
import type { SummaryV1 } from "../core/sim/simulate.ts";
import { renderReplayPage } from "./pages/replayPage.ts";
import { renderOgSvg } from "./pages/ogImage.ts";

const store = new JsonStore();
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.end(JSON.stringify(body));
}

async function parseJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

function isCreatureSpec(value: unknown): value is CreatureSpec {
  if (!value || typeof value !== "object") {
    return false;
  }
  const c = value as Record<string, unknown>;
  return c.rulesetVersion === RULESET_VERSION && typeof c.classKey === "string" && Number.isInteger(c.cosmeticSeed);
}

function isMoveArray(value: unknown): value is Move[] {
  return Array.isArray(value);
}

function getBaseUrl(req: import("node:http").IncomingMessage): string {
  const host = req.headers.host ?? `localhost:${PORT}`;
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader) ? forwardedProtoHeader[0] : forwardedProtoHeader;
  const proto = forwardedProto ? forwardedProto.split(",")[0].trim() : "http";
  return `${proto}://${host}`;
}

createServer(async (req, res) => {
  try {
    if (!req.url || !req.method) {
      sendJson(res, 400, { error: "Invalid request" });
      return;
    }

    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    if (req.method === "GET" && path === "/") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end("<!doctype html><html><body><h1>Fart And Furious</h1><p>Replay page: /r/:publicId</p><p>Replay API: /api/replay/:publicId</p></body></html>");
      return;
    }

    if (req.method === "POST" && path === "/api/players/guest") {
      const profile = await store.getOrCreatePlayer();
      sendJson(res, 200, { playerId: profile.id, profile });
      return;
    }

    const playerMeta = path.match(/^\/api\/players\/([^/]+)$/);
    if (req.method === "GET" && playerMeta) {
      const playerId = decodeURIComponent(playerMeta[1]);
      const profile = await store.getOrCreatePlayer(playerId);
      const nowISO = new Date().toISOString();
      const todayMission = await store.checkAndAwardDailyMission(playerId, nowISO);
      const daily = await store.getLeaderboard("daily", "stinkFame");
      const weekly = await store.getLeaderboard("weekly", "stinkFame");
      sendJson(res, 200, {
        profile,
        todayMission,
        leaderboards: { dailyStinkFame: daily, weeklyStinkFame: weekly },
      });
      return;
    }

    if (req.method === "POST" && path === "/api/challenges") {
      const body = (await parseJsonBody(req)) as { creatureA?: CreatureSpec; expiresInHours?: number; playerId?: string };
      if (!isCreatureSpec(body.creatureA)) {
        sendJson(res, 400, { error: "Invalid creatureA" });
        return;
      }

      const creator = await store.getOrCreatePlayer(body.playerId);
      const challenge = await store.createChallenge({
        creatureA: body.creatureA,
        expiresInHours: body.expiresInHours,
        playerAId: creator.id,
      });
      sendJson(res, 200, {
        token: challenge.token,
        url: `/c/${challenge.token}`,
        playerId: creator.id,
        challenge,
      });
      return;
    }

    const acceptMatch = path.match(/^\/api\/challenges\/([^/]+)\/accept$/);
    if (req.method === "POST" && acceptMatch) {
      const token = decodeURIComponent(acceptMatch[1]);
      const body = (await parseJsonBody(req)) as { creatureB?: CreatureSpec; playerId?: string };
      if (!isCreatureSpec(body.creatureB)) {
        sendJson(res, 400, { error: "Invalid creatureB" });
        return;
      }

      const joiner = await store.getOrCreatePlayer(body.playerId);
      const match = await store.acceptChallenge(token, body.creatureB, joiner.id);
      sendJson(res, 200, {
        matchId: match.id,
        publicId: match.publicId,
        status: match.status,
        playerId: joiner.id,
      });
      return;
    }

    const movesMatch = path.match(/^\/api\/matches\/([^/]+)\/moves$/);
    if (req.method === "POST" && movesMatch) {
      const matchId = decodeURIComponent(movesMatch[1]);
      const body = (await parseJsonBody(req)) as { side?: Side; moves?: Move[] };
      if (body.side !== "A" && body.side !== "B") {
        sendJson(res, 400, { error: "Invalid side" });
        return;
      }

      if (!isMoveArray(body.moves)) {
        sendJson(res, 400, { error: "Invalid moves" });
        return;
      }

      await store.submitMoves(matchId, body.side, body.moves);
      const finalized = await store.finalizeMatchIfReady(matchId);
      if (finalized.status === "finished") {
        const payload = await store.getFinalizedPayload(matchId);
        sendJson(res, 200, {
          status: "finished",
          summary: payload?.summary,
          replayUrl: `/api/replay/${finalized.publicId}`,
        });
        return;
      }

      sendJson(res, 200, { status: "waiting_for_opponent" });
      return;
    }

    const replayShare = path.match(/^\/api\/replay\/([^/]+)\/share$/);
    if (req.method === "POST" && replayShare) {
      const publicId = decodeURIComponent(replayShare[1]);
      const body = (await parseJsonBody(req)) as { playerId?: string };
      const profile = await store.getOrCreatePlayer(body.playerId);
      const result = await store.recordShare(profile.id, publicId);
      const updated = await store.getOrCreatePlayer(profile.id);
      sendJson(res, 200, { ...result, profile: updated, playerId: profile.id });
      return;
    }

    if (req.method === "GET" && path === "/api/leaderboards") {
      const scope = (url.searchParams.get("scope") ?? "daily") as LeaderboardScope;
      const metricRaw = url.searchParams.get("metric") ?? "stinkFame";
      const metric = metricRaw === "stinkFame" || metricRaw === "maxHit" || metricRaw === "cataclysms" ? (metricRaw as LeaderboardMetric) : "stinkFame";
      if (scope !== "daily" && scope !== "weekly") {
        sendJson(res, 400, { error: "Invalid scope" });
        return;
      }
      const rows = await store.getLeaderboard(scope, metric);
      sendJson(res, 200, { scope, metric, rows });
      return;
    }

    const matchMeta = path.match(/^\/api\/matches\/([^/]+)$/);
    if (req.method === "GET" && matchMeta) {
      const matchId = decodeURIComponent(matchMeta[1]);
      const match = await store.getMatch(matchId);
      if (!match) {
        sendJson(res, 404, { error: "Match not found" });
        return;
      }

      const payload = await store.getFinalizedPayload(matchId);
      sendJson(res, 200, {
        id: match.id,
        publicId: match.publicId,
        status: match.status,
        challengeId: match.challengeId,
        seedHex: match.seed_hex,
        summary: payload?.summary,
      });
      return;
    }

    const replayMatch = path.match(/^\/api\/replay\/([^/]+)$/);
    if (req.method === "GET" && replayMatch) {
      const publicId = decodeURIComponent(replayMatch[1]);
      const replay = await store.getReplayByPublicId(publicId);
      if (!replay) {
        sendJson(res, 404, { error: "Replay not found" });
        return;
      }

      sendJson(res, 200, {
        input: replay.input,
        events: replay.events,
        summary: replay.summary,
        matchHash: replay.matchHash,
        seedHex: replay.seedHex,
      });
      return;
    }

    const replayPageMatch = path.match(/^\/r\/([^/]+)$/);
    if (req.method === "GET" && replayPageMatch) {
      const publicId = decodeURIComponent(replayPageMatch[1]);
      const match = await store.getMatchByPublicId(publicId);
      if (!match || match.status !== "finished" || !match.summary_json || !match.seed_hex || !match.match_hash_hex) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Replay not found");
        return;
      }

      const html = renderReplayPage({
        publicId,
        replayData: {
          summary: JSON.parse(match.summary_json) as SummaryV1,
          matchHash: match.match_hash_hex,
          seedHex: match.seed_hex,
        },
        baseUrl: getBaseUrl(req),
      });

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }

    const ogImageMatch = path.match(/^\/og\/([^/]+)$/);
    if (req.method === "GET" && ogImageMatch) {
      const publicId = decodeURIComponent(ogImageMatch[1]);
      const match = await store.getMatchByPublicId(publicId);
      if (!match || match.status !== "finished" || !match.summary_json || !match.match_hash_hex) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Replay not found");
        return;
      }

      const svg = renderOgSvg({
        publicId,
        summary: JSON.parse(match.summary_json) as SummaryV1,
        matchHash: match.match_hash_hex,
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.end(svg);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, 400, { error: message });
  }
}).listen(PORT, () => {
  console.log(`[FAF] server listening on http://localhost:${PORT}`);
});
