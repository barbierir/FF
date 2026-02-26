import type { IncomingMessage } from "node:http";

type Bucket = { tokens: number; lastMs: number };

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  allow(key: string, limitPerMinute: number, nowMs = Date.now()): boolean {
    const refillPerMs = limitPerMinute / 60_000;
    const bucket = this.buckets.get(key) ?? { tokens: limitPerMinute, lastMs: nowMs };
    const elapsed = Math.max(0, nowMs - bucket.lastMs);
    bucket.tokens = Math.min(limitPerMinute, bucket.tokens + elapsed * refillPerMs);
    bucket.lastMs = nowMs;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}

export function getRequestIp(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(xff) ? xff[0] : xff;
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}
