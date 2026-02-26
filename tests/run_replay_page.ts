import { rm } from "node:fs/promises";
import path from "node:path";
import { JsonStore } from "../src/server/storage/jsonStore.ts";
import { renderReplayPage } from "../src/server/pages/replayPage.ts";
import { renderOgSvg } from "../src/server/pages/ogImage.ts";
import type { SummaryV1 } from "../src/core/sim/simulate.ts";

async function main(): Promise<void> {
  const baseDir = path.resolve(process.cwd(), "data", "faf-test-replay-page");
  await rm(baseDir, { recursive: true, force: true });

  const store = new JsonStore(baseDir, "test-secret");

  const challenge = await store.createChallenge({
    creatureA: { classKey: "fairy", cosmeticSeed: 7 },
    expiresInHours: 1,
  });

  const match = await store.acceptChallenge(challenge.token, {
    classKey: "dragon",
    cosmeticSeed: 13,
  });

  await store.submitMoves(match.id, "A", [
    { type: "ATTACK", gas: 2 },
    { type: "HEAL" },
  ]);

  await store.submitMoves(match.id, "B", [
    { type: "ATTACK", gas: 3 },
    { type: "DEFEND" },
  ]);

  const finalized = await store.finalizeMatchIfReady(match.id);
  if (finalized.status !== "finished" || !finalized.summary_json || !finalized.match_hash_hex || !finalized.seed_hex) {
    throw new Error("Expected finished match with summary/hash/seed");
  }

  const summary = JSON.parse(finalized.summary_json) as SummaryV1;
  const html = renderReplayPage({
    publicId: finalized.publicId,
    replayData: {
      summary,
      matchHash: finalized.match_hash_hex,
      seedHex: finalized.seed_hex,
    },
    baseUrl: "https://faf.example",
  });

  if (!html.includes(`https://faf.example/og/${finalized.publicId}`)) {
    throw new Error("Replay page missing og:image URL");
  }

  if (!html.includes(finalized.match_hash_hex.slice(0, 10))) {
    throw new Error("Replay page missing hash prefix in description");
  }

  const svg = renderOgSvg({
    publicId: finalized.publicId,
    summary,
    matchHash: finalized.match_hash_hex,
  });

  if (!svg.includes("Fart And Furious")) {
    throw new Error("SVG missing game title");
  }

  if (!svg.includes(finalized.publicId)) {
    throw new Error("SVG missing publicId");
  }

  console.log("ok");
}

await main();
