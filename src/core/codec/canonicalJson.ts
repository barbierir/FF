function assertCanonicalNumber(value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error("Canonical JSON only supports integer numbers");
  }
}

export function canonicalize(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  if (typeof value === "number") {
    assertCanonicalNumber(value);
    return value;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const sortedKeys = Object.keys(input).sort();
    for (const key of sortedKeys) {
      out[key] = canonicalize(input[key]);
    }
    return out;
  }

  throw new Error(`Unsupported value type in canonical JSON: ${typeof value}`);
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
