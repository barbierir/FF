const U64_MASK = (1n << 64n) - 1n;
const MULTIPLIER = 6364136223846793005n;
const INCREMENT = 1442695040888963407n; // must be odd

/**
 * Deterministic PCG32 PRNG with uint64 state.
 *
 * Notes:
 * - Uses bigint for full 64-bit state progression.
 * - Produces uint32 outputs via XSH-RR output transform.
 */
export class PCG32 {
  private state: bigint;

  constructor(seedU64: bigint) {
    this.state = seedU64 & U64_MASK;
  }

  nextUInt32(): number {
    const oldState = this.state;
    this.state = (oldState * MULTIPLIER + INCREMENT) & U64_MASK;

    const xorshifted = Number((((oldState >> 18n) ^ oldState) >> 27n) & 0xffff_ffffn);
    const rot = Number((oldState >> 59n) & 31n);

    // Rotate right on uint32.
    return ((xorshifted >>> rot) | (xorshifted << ((32 - rot) & 31))) >>> 0;
  }

  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error("nextInt bounds must be integers");
    }
    if (max < min) {
      throw new Error("nextInt requires max >= min");
    }

    const span = max - min + 1;
    const threshold = (0x1_0000_0000 % span) >>> 0;

    while (true) {
      const value = this.nextUInt32();
      if (value >= threshold) {
        return min + (value % span);
      }
    }
  }

  nextRoll10000(): number {
    return this.nextInt(0, 9999);
  }
}
