import { createHash } from "node:crypto";

/**
 * Stable SHA-256 hex digest for UTF-8 input.
 *
 * Node crypto is used first for deterministic, synchronous hashing.
 * Browser-only runtimes should provide an adapter around WebCrypto if needed.
 */
export function sha256Hex(inputUtf8: string): string {
  return createHash("sha256").update(inputUtf8, "utf8").digest("hex");
}
