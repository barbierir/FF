import { useMemo, useState } from "react";

type CreatureIdleProps = {
  classKey: string;
  size?: number;
  alt?: string;
};

type IdleMode = "primary" | "fallback";

const isDev = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
const IDLE_ASSET_BY_CLASS: Record<string, string> = {
  goblin: "/creatures/goblin/idle_placeholder.png",
  dragon: "/creatures/dragon/idle_placeholder.png",
  skunk: "/creatures/skunk/idle_placeholder.png",
  troll: "/creatures/troll/idle_placeholder.png",
  fairy: "/creatures/fairy/idle_placeholder.png",
  demon: "/creatures/demon/idle_placeholder.png",
};

export default function CreatureIdle({ classKey, size = 72, alt }: CreatureIdleProps) {
  const [mode, setMode] = useState<IdleMode>("primary");
  const label = useMemo(() => classKey || "unknown", [classKey]);
  const idleAsset = useMemo(() => IDLE_ASSET_BY_CLASS[label] ?? `/creatures/${label}/idle_placeholder.png`, [label]);

  const src = mode === "primary" ? idleAsset : "";

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
        setMode("fallback");
      }}
    />
  );
}
