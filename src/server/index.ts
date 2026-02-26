import { createServer } from "node:http";
import { URL } from "node:url";
import { JsonStore } from "./storage/jsonStore.ts";
import { RULESET_VERSION } from "../core/types.ts";
import type { CreatureSpec, Move } from "../core/types.ts";
import type { Side } from "./storage/types.ts";

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

    if (req.method === "POST" && path === "/api/challenges") {
      const body = (await parseJsonBody(req)) as { creatureA?: CreatureSpec; expiresInHours?: number };
      if (!isCreatureSpec(body.creatureA)) {
        sendJson(res, 400, { error: "Invalid creatureA" });
        return;
      }

      const challenge = await store.createChallenge({
        creatureA: body.creatureA,
        expiresInHours: body.expiresInHours,
      });
      sendJson(res, 200, {
        token: challenge.token,
        url: `/c/${challenge.token}`,
        challenge,
      });
      return;
    }

    const acceptMatch = path.match(/^\/api\/challenges\/([^/]+)\/accept$/);
    if (req.method === "POST" && acceptMatch) {
      const token = decodeURIComponent(acceptMatch[1]);
      const body = (await parseJsonBody(req)) as { creatureB?: CreatureSpec };
      if (!isCreatureSpec(body.creatureB)) {
        sendJson(res, 400, { error: "Invalid creatureB" });
        return;
      }

      const match = await store.acceptChallenge(token, body.creatureB);
      sendJson(res, 200, {
        matchId: match.id,
        publicId: match.publicId,
        status: match.status,
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

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, 400, { error: message });
  }
}).listen(PORT, () => {
  console.log(`[FAF] server listening on http://localhost:${PORT}`);
  // curl examples:
  // curl -X POST http://localhost:${PORT}/api/challenges -H 'content-type: application/json' -d '{"creatureA":{"rulesetVersion":"1.0.0","classKey":"goblin","cosmeticSeed":1}}'
  // curl -X POST http://localhost:${PORT}/api/challenges/<token>/accept -H 'content-type: application/json' -d '{"creatureB":{"rulesetVersion":"1.0.0","classKey":"dragon","cosmeticSeed":2}}'
});
