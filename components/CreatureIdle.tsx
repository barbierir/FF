import { useMemo, useState } from "react";

type CreatureIdleProps = {
  classKey: string;
  size?: number;
  alt?: string;
};

type IdleMode = "webp" | "gif" | "fallback";

export default function CreatureIdle({ classKey, size = 72, alt }: CreatureIdleProps) {
  const [mode, setMode] = useState<IdleMode>("webp");
  const label = useMemo(() => classKey || "unknown", [classKey]);

  const src = mode === "webp"
    ? `/creatures/idle/${label}.webp`
    : mode === "gif"
      ? `/creatures/idle/${label}.gif`
      : "";

  if (mode === "fallback") {
    return (
      <div className="creature-fallback" style={{ width: size, height: size }} aria-label={alt ?? `${label} idle fallback`}>
        <span aria-hidden="true">💨</span>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? `${label} idle creature`}
      width={size}
      height={size}
      className="creature-idle"
      onError={() => setMode((prev) => (prev === "webp" ? "gif" : "fallback"))}
    />
  );
}
