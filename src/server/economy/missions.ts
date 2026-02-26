import { sha256Hex } from "../../core/crypto/hash.ts";

export type MissionType = "PLAY_1" | "WIN_1" | "CATACLYSM_1" | "BACKFIRE_SURVIVE" | "MAXHIT_9";

export type Mission = {
  type: MissionType;
  goal: number;
  label: string;
  reward: { gc: number; sf: number };
};

const MISSION_POOL: Mission[] = [
  { type: "PLAY_1", goal: 1, label: "Play 1 match today", reward: { gc: 30, sf: 10 } },
  { type: "WIN_1", goal: 1, label: "Win 1 match today", reward: { gc: 30, sf: 10 } },
  { type: "CATACLYSM_1", goal: 1, label: "Land 1 cataclysm today", reward: { gc: 30, sf: 10 } },
  { type: "BACKFIRE_SURVIVE", goal: 1, label: "Backfire at least once and don't lose", reward: { gc: 30, sf: 10 } },
  { type: "MAXHIT_9", goal: 1, label: "Hit max damage 9+ today", reward: { gc: 30, sf: 10 } },
];

export function toDayKey(dateISO: string): string {
  return dateISO.slice(0, 10).replaceAll("-", "");
}

export function getDailyMission(dateISO: string, playerId: string): Mission {
  const day = toDayKey(dateISO);
  const seed = sha256Hex(`mission:${day}:${playerId}`);
  const firstByte = Number.parseInt(seed.slice(0, 2), 16);
  return MISSION_POOL[firstByte % MISSION_POOL.length];
}
