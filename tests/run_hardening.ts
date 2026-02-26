import { rm } from "node:fs/promises";
import path from "node:path";
import { TokenBucketRateLimiter } from "../src/server/rateLimit.ts";
import { JsonStore } from "../src/server/storage/jsonStore.ts";
import { HttpError } from "../src/server/errors.ts";
import { validateMoves } from "../src/server/validate.ts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function expectHttpError(fn: () => Promise<unknown> | unknown, status: number): Promise<void> {
  try {
    await fn();
    throw new Error(`Expected HttpError ${status}`);
  } catch (error) {
    if (!(error instanceof HttpError)) {
      throw error;
    }
    assert(error.status === status, `Expected status ${status}, got ${error.status}`);
  }
}

async function main(): Promise<void> {
  const baseDir = path.resolve(process.cwd(), "data", "faf-test-hardening");
  await rm(baseDir, { recursive: true, force: true });
  const store = new JsonStore(baseDir, "test-secret");

  await expectHttpError(() => Promise.resolve(validateMoves("goblin", [{ type: "ATTACK", gas: 9 }])), 400);

  const expiredChallenge = await store.createChallenge({
    creatureA: { classKey: "goblin", cosmeticSeed: 1 },
    expiresInHours: 1,
  });
  const mutableExpired = await store.getChallengeByToken(expiredChallenge.token);
  if (!mutableExpired) throw new Error("missing challenge");
  mutableExpired.expiresAtISO = "2000-01-01T00:00:00.000Z";
  await expectHttpError(() => store.acceptChallenge(expiredChallenge.token, { classKey: "dragon", cosmeticSeed: 2 }), 410);

  const challenge = await store.createChallenge({
    creatureA: { classKey: "goblin", cosmeticSeed: 2 },
    expiresInHours: 1,
  });
  const match = await store.acceptChallenge(challenge.token, { classKey: "dragon", cosmeticSeed: 3 });

  await store.submitMoves(match.id, "A", [{ type: "ATTACK", gas: 1 }]);
  await expectHttpError(() => store.submitMoves(match.id, "A", [{ type: "ATTACK", gas: 2 }]), 409);

  const limiter = new TokenBucketRateLimiter();
  let blocked = false;
  for (let i = 0; i < 12; i += 1) {
    const allowed = limiter.allow("create:1.2.3.4", 10, 0);
    if (!allowed) {
      blocked = true;
      break;
    }
  }
  assert(blocked, "rate limiter should block when over limit");

  console.log("ok");
}

await main();
