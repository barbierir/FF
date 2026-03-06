import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { JsonStore } from "./storage/jsonStore.ts";
import type { LeaderboardMetric, LeaderboardScope } from "./economy/leaderboards.ts";
import type { Side } from "./storage/types.ts";
import { createRematchFromReplay, loadChallengeForViewer, submitMovesForPlayer } from "./rematchLifecycle.ts";
import { runRematchSmokeTest } from "./devRematchSmokeTest.ts";
import type { SummaryV1 } from "../core/sim/simulate.ts";
import { renderReplayPage } from "./pages/replayPage.ts";
import { renderOgSvg } from "./pages/ogImage.ts";
import { buildRematchText, buildShareText } from "./pages/shareText.ts";
import { renderDailyShell, renderLeaderboardShell, renderProfileShell, renderRivalryShell } from "./pages/simplePages.ts";
import { HttpError } from "./errors.ts";
import { dayKey, getRequestIp, TokenBucketRateLimiter } from "./rateLimit.ts";
import { maybeValidatePlayerId, validateCreatureSpec, validateExpiresInHours, validateId, validateMoves } from "./validate.ts";

const store = new JsonStore();
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const limiter = new TokenBucketRateLimiter();
const shareIpDailyCounts = new Map<string, number>();
const publicDir = path.resolve(process.cwd(), "public");

const STATIC_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-dev-reset-token");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.end(JSON.stringify(body));
}

function sendError(res: import("node:http").ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { error: { code, message } });
}

async function sendStaticFile(res: import("node:http").ServerResponse, fileName: string): Promise<void> {
  const fullPath = path.join(publicDir, fileName);
  const ext = path.extname(fileName).toLowerCase();
  const mime = STATIC_MIME[ext] ?? "application/octet-stream";
  const body = await readFile(fullPath);
  res.statusCode = 200;
  res.setHeader("Content-Type", mime);
  res.end(body);
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
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

function normalizeNicknameInput(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length ? normalized : undefined;
}

function getBaseUrl(req: import("node:http").IncomingMessage): string {
  const host = req.headers.host ?? `localhost:${PORT}`;
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader) ? forwardedProtoHeader[0] : forwardedProtoHeader;
  const proto = forwardedProto ? forwardedProto.split(",")[0].trim() : "http";
  return `${proto}://${host}`;
}

function enforceRateLimit(req: import("node:http").IncomingMessage, key: string, perMin: number): void {
  const ip = getRequestIp(req);
  if (!limiter.allow(`${key}:${ip}`, perMin)) {
    throw new HttpError(429, "rate_limited", "Rate limit exceeded");
  }
}

function enforceShareIpDailyCap(req: import("node:http").IncomingMessage): void {
  const ip = getRequestIp(req);
  const key = `${ip}:${dayKey(new Date().toISOString())}`;
  const next = (shareIpDailyCounts.get(key) ?? 0) + 1;
  if (next > 200) {
    throw new HttpError(429, "share_ip_cap_reached", "Daily share cap reached for this IP");
  }
  shareIpDailyCounts.set(key, next);
}


function enforceDevResetAccess(req: import("node:http").IncomingMessage): void {
  if (process.env.NODE_ENV !== "development") {
    throw new HttpError(404, "dev_only", "This endpoint is available only in development");
  }

  const expectedToken = process.env.DEV_RESET_TOKEN;
  if (!expectedToken) {
    return;
  }

  const header = req.headers["x-dev-reset-token"];
  const providedToken = Array.isArray(header) ? header[0] : header;
  if (providedToken !== expectedToken) {
    throw new HttpError(403, "invalid_dev_reset_token", "Invalid x-dev-reset-token");
  }
}

export function createApiServer(): import("node:http").Server {
  return createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        sendError(res, 400, "invalid_request", "Invalid request");
        return;
      }

      if (req.method === "OPTIONS") {
        sendJson(res, 204, {});
        return;
      }

      const url = new URL(req.url, `http://localhost:${PORT}`);
      const path = url.pathname;

      if (req.method === "GET" && path === "/") {
        console.log("serve index.html");
        await sendStaticFile(res, "index.html");
        return;
      }

      if (req.method === "GET" && path === "/home") {
        await sendStaticFile(res, "home.html");
        return;
      }

      if (req.method === "GET" && path === "/styles.css") {
        await sendStaticFile(res, "styles.css");
        return;
      }

      if (req.method === "GET" && path === "/app.js") {
        await sendStaticFile(res, "app.js");
        return;
      }

      const staticAssetPath = path.match(/^\/(creatures\/idle\/[a-z0-9_-]+\.(?:gif|webp))$/i);
      if (req.method === "GET" && staticAssetPath) {
        await sendStaticFile(res, staticAssetPath[1]);
        return;
      }

      if (req.method === "GET" && path === "/profile.html") {
        await sendStaticFile(res, "profile.html");
        return;
      }

      if (req.method === "GET" && path === "/profile.js") {
        await sendStaticFile(res, "profile.js");
        return;
      }

      const challengePage = path.match(/^\/c\/([^/]+)$/);
      if (req.method === "GET" && challengePage) {
        console.log(`serve challenge.html token=${decodeURIComponent(challengePage[1])}`);
        await sendStaticFile(res, "challenge.html");
        return;
      }

      const matchPage = path.match(/^\/m\/([^/]+)$/);
      if (req.method === "GET" && matchPage) {
        console.log(`serve match.html matchId=${decodeURIComponent(matchPage[1])}`);
        await sendStaticFile(res, "match.html");
        return;
      }

      const replayUiPage = path.match(/^\/replay\/([^/]+)$/);
      if (req.method === "GET" && replayUiPage) {
        console.log(`serve replay.html publicId=${decodeURIComponent(replayUiPage[1])}`);
        await sendStaticFile(res, "replay.html");
        return;
      }

      const publicProfilePage = path.match(/^\/p\/([^/]+)$/);
      if (req.method === "GET" && publicProfilePage) {
        const playerId = validateId("playerId", decodeURIComponent(publicProfilePage[1]), 3);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderProfileShell(playerId));
        return;
      }

      if (req.method === "GET" && path === "/leaderboard") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderLeaderboardShell());
        return;
      }

      const rivalryPage = path.match(/^\/rivalry\/([^/]+)-vs-([^/]+)$/);
      if (req.method === "GET" && rivalryPage) {
        const playerA = validateId("playerId", decodeURIComponent(rivalryPage[1]), 3);
        const playerB = validateId("playerId", decodeURIComponent(rivalryPage[2]), 3);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderRivalryShell(playerA, playerB));
        return;
      }

      if (req.method === "GET" && path === "/daily") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderDailyShell());
        return;
      }

      if ((req.method === "GET" || req.method === "POST") && path === "/api/dev/rematch-smoke-test") {
        enforceDevResetAccess(req);
        const report = await runRematchSmokeTest(store);
        sendJson(res, report.ok ? 200 : 500, report);
        return;
      }

      if (req.method === "POST" && path === "/api/dev/reset") {
        enforceDevResetAccess(req);
        const cleared = await store.resetAllData();
        sendJson(res, 200, { ok: true, cleared });
        return;
      }

      if (req.method === "POST" && path === "/api/players/guest") {
        const profile = await store.getOrCreatePlayer();
        sendJson(res, 200, { playerId: profile.id, profile });
        return;
      }

      const playerMeta = path.match(/^\/api\/players\/([^/]+)$/);
      if (req.method === "GET" && playerMeta) {
        const playerId = validateId("playerId", decodeURIComponent(playerMeta[1]), 3);
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

      const playerPublic = path.match(/^\/api\/players\/([^/]+)\/public$/);
      if (req.method === "GET" && playerPublic) {
        const playerId = validateId("playerId", decodeURIComponent(playerPublic[1]), 3);
        const payload = await store.getPublicPlayer(playerId);
        if (!payload) {
          throw new HttpError(404, "player_not_found", "Player not found");
        }
        sendJson(res, 200, payload);
        return;
      }

      if (req.method === "GET" && path === "/api/leaderboard/global") {
        const rows = await store.getGlobalLeaderboard();
        sendJson(res, 200, { rows });
        return;
      }

      const rivalryApi = path.match(/^\/api\/rivalry\/([^/]+)\/([^/]+)$/);
      if (req.method === "GET" && rivalryApi) {
        const playerA = validateId("playerId", decodeURIComponent(rivalryApi[1]), 3);
        const playerB = validateId("playerId", decodeURIComponent(rivalryApi[2]), 3);
        const data = await store.getRivalry(playerA, playerB);
        sendJson(res, 200, data);
        return;
      }

      if (req.method === "GET" && path === "/api/daily-highlight") {
        const daily = await store.getDailyHighlight();
        if (!daily) {
          throw new HttpError(404, "daily_not_found", "No daily highlight yet");
        }
        sendJson(res, 200, daily);
        return;
      }

      if (req.method === "POST" && path === "/api/challenges") {
        enforceRateLimit(req, "createChallenge", 10);
        const body = (await parseJsonBody(req)) as { creatureA?: unknown; expiresInHours?: unknown; playerId?: unknown; playerAId?: unknown; creatureId?: unknown; creatureNickname?: unknown };
        const creatureA = validateCreatureSpec(body.creatureA);
        const expiresInHours = validateExpiresInHours(body.expiresInHours);
        const playerId = maybeValidatePlayerId(body.playerAId ?? body.playerId);

        const creator = await store.getOrCreatePlayer(playerId);
        await store.setPlayerCreatureSelection(creator.id, body.creatureId as string | undefined, normalizeNicknameInput(body.creatureNickname));
        const challenge = await store.createChallenge({
          creatureA,
          expiresInHours,
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
        enforceRateLimit(req, "acceptChallenge", 20);
        const token = validateId("token", decodeURIComponent(acceptMatch[1]));
        const body = (await parseJsonBody(req)) as { creatureB?: unknown; playerId?: unknown; playerBId?: unknown; creatureId?: unknown; creatureNickname?: unknown };
        const creatureB = validateCreatureSpec(body.creatureB);
        const joiner = await store.getOrCreatePlayer(maybeValidatePlayerId(body.playerBId ?? body.playerId));
        await store.setPlayerCreatureSelection(joiner.id, body.creatureId as string | undefined, normalizeNicknameInput(body.creatureNickname));
        const match = await store.acceptChallenge(token, creatureB, joiner.id);
        sendJson(res, 200, {
          matchId: match.id,
          publicId: match.publicId,
          status: match.status,
          playerId: joiner.id,
        });
        return;
      }

      const openChallenges = path === "/api/challenges/open";
      if (req.method === "GET" && openChallenges) {
        const excludePlayerIdRaw = url.searchParams.get("excludePlayerId");
        const excludePlayerId = excludePlayerIdRaw ? validateId("playerId", excludePlayerIdRaw, 3) : undefined;
        const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 20;
        const challenges = await store.listChallenges(undefined, "open", limit, excludePlayerId);
        sendJson(res, 200, {
          items: challenges.map((challenge) => ({
            token: challenge.token,
            createdAtISO: challenge.createdAtISO,
            expiresAtISO: challenge.expiresAtISO,
            creatureA: challenge.creatureA,
            playerAId: challenge.playerAId ?? null,
          })),
        });
        return;
      }

      const myChallenges = path === "/api/challenges/mine";
      if (req.method === "GET" && myChallenges) {
        const playerId = validateId("playerId", url.searchParams.get("playerId"), 3);
        const statusRaw = url.searchParams.get("status") ?? "open";
        if (statusRaw !== "open" && statusRaw !== "accepted") {
          throw new HttpError(400, "invalid_status", "status must be 'open' or 'accepted'");
        }
        const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 20;
        const challenges = await store.listChallenges(playerId, statusRaw, limit);
        sendJson(res, 200, {
          items: challenges.map((challenge) => ({
            token: challenge.token,
            createdAtISO: challenge.createdAtISO,
            expiresAtISO: challenge.expiresAtISO,
            creatureA: challenge.creatureA,
            playerAId: challenge.playerAId ?? null,
            status: challenge.status,
          })),
        });
        return;
      }


      const challengeMeta = path.match(/^\/api\/challenges\/([^/]+)$/);
      if (req.method === "GET" && challengeMeta) {
        const token = validateId("token", decodeURIComponent(challengeMeta[1]));
        const viewerIdRaw = url.searchParams.get("viewerId");
        const viewerId = viewerIdRaw ? validateId("viewerId", viewerIdRaw, 3) : undefined;
        const challenge = await loadChallengeForViewer(store, token, viewerId);
        const playerAProfile = challenge.playerAId ? await store.getOrCreatePlayer(challenge.playerAId) : undefined;
        const playerBProfile = challenge.playerBId ? await store.getOrCreatePlayer(challenge.playerBId) : undefined;
        sendJson(res, 200, {
          id: challenge.id,
          token: challenge.token,
          status: challenge.status,
          playerAId: challenge.playerAId ?? null,
          playerBId: challenge.playerBId ?? null,
          playerACreatureId: playerAProfile?.creatureId,
          playerANickname: playerAProfile?.creatureNickname,
          playerBCreatureId: playerBProfile?.creatureId,
          playerBNickname: playerBProfile?.creatureNickname,
          creatureA: challenge.creatureA,
          creatureB: challenge.creatureB,
          createdAtISO: challenge.createdAtISO,
          expiresAtISO: challenge.expiresAtISO,
          acceptedAtISO: challenge.acceptedAtISO,
          matchId: challenge.matchId,
          publicId: challenge.matchId ? (await store.getMatch(challenge.matchId))?.publicId : undefined,
        });
        return;
      }

      const movesMatch = path.match(/^\/api\/matches\/([^/]+)\/moves$/);
      if (req.method === "POST" && movesMatch) {
        enforceRateLimit(req, "submitMoves", 30);
        const matchId = validateId("matchId", decodeURIComponent(movesMatch[1]), 4);
        const body = (await parseJsonBody(req)) as { side?: Side; moves?: unknown; playerId?: unknown };
        const playerId = validateId("playerId", body.playerId, 3);
        const hintedSide = body.side === "A" || body.side === "B" ? body.side : undefined;

        const match = await store.getMatch(matchId);
        if (!match) {
          throw new HttpError(404, "match_not_found", "Match not found");
        }
        const challengeObj = await store.getChallengeById(match.challengeId);
        if (!challengeObj) {
          throw new HttpError(409, "challenge_state_invalid", "Challenge state is invalid");
        }
        const resolvedSide: Side = challengeObj.playerAId === playerId ? "A" : challengeObj.playerBId === playerId ? "B" : (() => {
          throw new HttpError(403, "player_not_in_match", "playerId is not part of this match");
        })();
        const classKey = resolvedSide === "A" ? challengeObj.creatureA?.classKey : challengeObj.creatureB?.classKey;
        if (!classKey) {
          throw new HttpError(409, "challenge_state_invalid", "Challenge state is invalid");
        }
        const moves = validateMoves(classKey, body.moves);

        const submission = await submitMovesForPlayer(store, matchId, playerId, moves, hintedSide);
        console.log(`[match.finalize-check] matchId=${matchId} playerId=${playerId} side=${submission.side}`);
        if (submission.sideHintIgnored) {
          console.log(`[match.side-hint-ignored] matchId=${matchId} playerId=${playerId} hinted=${hintedSide} resolved=${submission.side}`);
        }
        if (submission.status === "finished") {
          const finalized = await store.getMatch(matchId);
          const payload = await store.getFinalizedPayload(matchId);
          sendJson(res, 200, {
            status: "finished",
            summary: payload?.summary,
            replayUrl: finalized ? `/api/replay/${finalized.publicId}` : undefined,
          });
          return;
        }

        sendJson(res, 200, { status: "waiting_for_opponent" });
        return;
      }

      const replayShare = path.match(/^\/api\/replay\/([^/]+)\/share$/);
      const rematchMatch = path.match(/^\/api\/rematch\/([^/]+)$/);
      if (req.method === "POST" && rematchMatch) {
        enforceRateLimit(req, "createChallenge", 10);
        const publicId = validateId("publicId", decodeURIComponent(rematchMatch[1]));
        const body = (await parseJsonBody(req)) as { playerId?: unknown; side?: unknown };
        const playerId = validateId("playerId", body.playerId, 3);
        const side = body.side;
        if (side !== "A" && side !== "B") {
          throw new HttpError(400, "invalid_side", "side must be 'A' or 'B'");
        }

        const challenge = await createRematchFromReplay(store, publicId, playerId, side);
        const match = await store.getMatchByPublicId(publicId);
        const replay = await store.getReplayByPublicId(publicId);
        const rematchUrl = `${getBaseUrl(req)}/c/${challenge.token}`;
        const replayUrl = `${getBaseUrl(req)}/r/${publicId}`;
        const opponentPlayerId = side === "A" ? (match?.playerBId ?? null) : (match?.playerAId ?? null);

        sendJson(res, 200, {
          token: challenge.token,
          url: `/c/${challenge.token}`,
          challenge,
          suggestedText: replay ? buildRematchText(replay.summary as SummaryV1, replayUrl, rematchUrl) : undefined,
          opponentHint: opponentPlayerId ? { playerId: opponentPlayerId } : null,
          baseUrl: getBaseUrl(req),
        });
        return;
      }

      if (req.method === "POST" && replayShare) {
        enforceRateLimit(req, "share", 60);
        enforceShareIpDailyCap(req);
        const publicId = validateId("publicId", decodeURIComponent(replayShare[1]));
        const replay = await store.getReplayByPublicId(publicId);
        if (!replay) {
          throw new HttpError(404, "replay_not_found", "Replay not found");
        }

        const body = (await parseJsonBody(req)) as { playerId?: unknown };
        const profile = await store.getOrCreatePlayer(maybeValidatePlayerId(body.playerId));
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
          throw new HttpError(400, "invalid_scope", "Invalid scope");
        }
        const rows = await store.getLeaderboard(scope, metric);
        sendJson(res, 200, { scope, metric, rows });
        return;
      }

      const matchMeta = path.match(/^\/api\/matches\/([^/]+)$/);
      if (req.method === "GET" && matchMeta) {
        const matchId = validateId("matchId", decodeURIComponent(matchMeta[1]), 4);
        const match = await store.getMatch(matchId);
        if (!match) {
          throw new HttpError(404, "match_not_found", "Match not found");
        }

        const challenge = await store.getChallengeById(match.challengeId);
        const payload = await store.getFinalizedPayload(matchId);
        sendJson(res, 200, {
          id: match.id,
          publicId: match.publicId,
          status: match.status,
          challengeId: match.challengeId,
          creatureA: challenge?.creatureA,
          creatureB: challenge?.creatureB,
          seedHex: match.seed_hex,
          summary: payload?.summary,
        });
        return;
      }

      const replayMatch = path.match(/^\/api\/replay\/([^/]+)$/);
      if (req.method === "GET" && replayMatch) {
        const publicId = validateId("publicId", decodeURIComponent(replayMatch[1]));
        const replay = await store.getReplayByPublicId(publicId);
        if (!replay) {
          throw new HttpError(404, "replay_not_found", "Replay not found");
        }

        sendJson(res, 200, {
          input: replay.input,
          events: replay.events,
          summary: replay.summary,
          matchHash: replay.matchHash,
          seedHex: replay.seedHex,
          match: replay.match,
        });
        return;
      }

      const replayShareText = path.match(/^\/api\/replay\/([^/]+)\/share-text$/);
      if (req.method === "GET" && replayShareText) {
        const publicId = validateId("publicId", decodeURIComponent(replayShareText[1]));
        const replay = await store.getReplayByPublicId(publicId);
        if (!replay) {
          throw new HttpError(404, "replay_not_found", "Replay not found");
        }
        const match = await store.getMatchByPublicId(publicId);
        const challenge = match ? await store.getChallengeById(match.challengeId) : undefined;
        const playerAProfile = challenge?.playerAId ? await store.getOrCreatePlayer(challenge.playerAId) : undefined;
        const playerBProfile = challenge?.playerBId ? await store.getOrCreatePlayer(challenge.playerBId) : undefined;
        const text = buildShareText(replay.summary as SummaryV1, publicId, getBaseUrl(req), { a: playerAProfile?.creatureNickname, b: playerBProfile?.creatureNickname });
        sendJson(res, 200, { text });
        return;
      }

      const replayPageMatch = path.match(/^\/r\/([^/]+)$/);
      if (req.method === "GET" && replayPageMatch) {
        const publicId = validateId("publicId", decodeURIComponent(replayPageMatch[1]));
        const match = await store.getMatchByPublicId(publicId);
        if (!match || match.status !== "finished" || !match.summary_json || !match.seed_hex || !match.match_hash_hex) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Replay not found");
          return;
        }

        const challenge = await store.getChallengeById(match.challengeId);
        const playerAProfile = challenge?.playerAId ? await store.getOrCreatePlayer(challenge.playerAId) : undefined;
        const playerBProfile = challenge?.playerBId ? await store.getOrCreatePlayer(challenge.playerBId) : undefined;
        const html = renderReplayPage({
          publicId,
          replayData: {
            summary: JSON.parse(match.summary_json) as SummaryV1,
            matchHash: match.match_hash_hex,
            seedHex: match.seed_hex,
          },
          matchupLabel: `${playerAProfile?.creatureNickname || challenge?.creatureA.classKey || "Challenger"} vs ${playerBProfile?.creatureNickname || challenge?.creatureB?.classKey || "Opponent"}`,
          baseUrl: getBaseUrl(req),
        });

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
        return;
      }

      const ogImageMatch = path.match(/^\/og\/([^/]+)$/);
      if (req.method === "GET" && ogImageMatch) {
        const publicId = validateId("publicId", decodeURIComponent(ogImageMatch[1]));
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

      sendError(res, 404, "not_found", "Not found");
    } catch (error) {
      if (error instanceof HttpError) {
        sendError(res, error.status, error.code, error.message);
        return;
      }
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        sendError(res, 404, "not_found", "Not found");
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      sendError(res, 400, "bad_request", message);
    }
  });
}

function assertNodeVersion(): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < 20) {
    console.error("Node 20+ required to run TS directly. Please upgrade Node or run compiled JS build.");
    process.exit(1);
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  assertNodeVersion();
  createApiServer().listen(PORT, () => {
    console.log(`[FAF] server listening on http://localhost:${PORT}`);
    console.log("[FAF] MVP rate limiting is best-effort and in-memory.");
  });
}
