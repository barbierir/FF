import { canonicalStringify } from "../codec/canonicalJson.ts";
import { sha256Hex } from "../crypto/hash.ts";
import { RULESET_VERSION } from "../types.ts";
import type { MatchInput } from "../types.ts";

export function deriveSeedU64(input: MatchInput, serverSalt: string): bigint {
  const seedMaterial = canonicalStringify({
    rulesetVersion: RULESET_VERSION,
    challengeId: input.challengeId,
    creatureA: input.creatureA,
    creatureB: input.creatureB,
    movesA: input.movesA,
    movesB: input.movesB,
    createdAtISO: input.createdAtISO,
    serverSalt,
  });

  const seedHex = sha256Hex(seedMaterial);
  return BigInt(`0x${seedHex.slice(0, 16)}`);
}
