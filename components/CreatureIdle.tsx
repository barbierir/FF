import { useMemo, useState } from "react";

type CreatureIdleProps = {
  classKey: string;
  size?: number;
  alt?: string;
};

type IdleMode = "webp" | "gif" | "fallback";

const isDev = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
const IDLE_ASSET_BY_CLASS: Record<string, string> = {
  goblin: "goblin",
  dragon: "dragon",
  skunk: "slime",
  troll: "skeleton",
  fairy: "wizard",
  demon: "demon",
};

export default function CreatureIdle({ classKey, size = 72, alt }: CreatureIdleProps) {
  const [mode, setMode] = useState<IdleMode>("webp");
  const label = useMemo(() => classKey || "unknown", [classKey]);
  const idleAsset = useMemo(() => IDLE_ASSET_BY_CLASS[label] ?? label, [label]);

  const src = mode === "webp"
    ? `/creatures/idle/${idleAsset}.webp`
    : mode === "gif"
      ? `/creatures/idle/${idleAsset}.gif`
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
      onError={(event) => {
        if (isDev) {
          console.warn("[CreatureIdle] failed to load idle image", {
            creatureId: label,
            attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src,
          });
        }
        setMode((prev) => (prev === "webp" ? "gif" : "fallback"));
      }}
    />
  );
}
