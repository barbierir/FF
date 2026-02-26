/**
 * This test file is intended to be run with Vitest.
 * In no-deps environments (no npm install), run:
 *   node --experimental-strip-types tests/run_determinism.ts
 */

import { describe, expect, it } from "vitest";

import { canonicalStringify } from "../src/core/codec/canonicalJson";
import { sha256Hex } from "../src/core/crypto/hash";
import { PCG32 } from "../src/core/rng/pcg32";

describe("determinism foundations", () => {
  it("canonicalStringify is stable across key insertion order", () => {
    const first = {
      z: 1,
      a: {
        b: 2,
        a: 1,
      },
      m: [{ y: 2, x: 1 }],
    };

    const second = {
      m: [{ x: 1, y: 2 }],
      a: {
        a: 1,
        b: 2,
      },
      z: 1,
    };

    expect(canonicalStringify(first)).toBe('{"a":{"a":1,"b":2},"m":[{"x":1,"y":2}],"z":1}');
    expect(canonicalStringify(second)).toBe(canonicalStringify(first));
  });

  it("PCG32 emits stable outputs for a fixed seed", () => {
    const rng = new PCG32(42n);
    const values = Array.from({ length: 8 }, () => rng.nextUInt32());

    expect(values).toEqual([
      0,
      1971522493,
      242089394,
      3457789919,
      3637502659,
      19596830,
      3604887170,
      2990774977,
    ]);
  });

  it("sha256Hex matches known vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
