const CLASS_KEYS = ["goblin", "dragon", "skunk", "troll", "fairy"];
const PLAYER_ID_KEY = "faf_playerId";
const LEGACY_PLAYER_ID_KEY = "faf_player_id";
const LAST_REPLAY_PUBLIC_ID_KEY = "faf_lastReplayPublicId";
const FORCE_NEW_QUERY_KEY = "new";
const FORCE_NEW_QUERY_VALUE = "1";

const STICKY_RESUME_KEYS = [
  "faf_lastMatchId",
  "faf_lastReplayPublicId",
  "faf_lastPublicId",
  "faf_lastRoute",
  "faf_resume",
  "lastMatchId",
  "lastPublicId",
  "lastReplay",
  "lastChallengeToken",
];

function forceNewChallengeRequested() {
  return new URLSearchParams(location.search).get(FORCE_NEW_QUERY_KEY) === FORCE_NEW_QUERY_VALUE;
}

function clearStickyResumeState() {
  for (const key of STICKY_RESUME_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {}
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
}

window.__FAF_FORCE_NEW = forceNewChallengeRequested();
if (window.__FAF_FORCE_NEW) {
  clearStickyResumeState();
}

export function shouldSkipAutoResume() {
  return Boolean(window.__FAF_FORCE_NEW);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(err);
  }
  return json;
}

export function getPlayerIdOrNull() {
  const playerId = localStorage.getItem(PLAYER_ID_KEY);
  if (playerId) return playerId;
  const legacyPlayerId = localStorage.getItem(LEGACY_PLAYER_ID_KEY);
  if (!legacyPlayerId) return null;
  localStorage.setItem(PLAYER_ID_KEY, legacyPlayerId);
  localStorage.removeItem(LEGACY_PLAYER_ID_KEY);
  return legacyPlayerId;
}

export async function getOrCreateGuestPlayer() {
  let playerId = getPlayerIdOrNull();
  if (playerId) return playerId;
  const created = await api("/api/players/guest", { method: "POST", body: "{}" });
  playerId = created.playerId;
  localStorage.setItem(PLAYER_ID_KEY, playerId);
  return playerId;
}

export function rememberLastReplayPublicId(publicId) {
  if (shouldSkipAutoResume()) return;
  if (!publicId) return;
  localStorage.setItem(LAST_REPLAY_PUBLIC_ID_KEY, publicId);
}

export function updateResumeReplayLink() {
  const resumeLink = document.getElementById("navResumeReplay");
  if (!resumeLink) return;
  if (shouldSkipAutoResume()) {
    resumeLink.hidden = true;
    resumeLink.href = "/";
    return;
  }
  const publicId = localStorage.getItem(LAST_REPLAY_PUBLIC_ID_KEY);
  if (!publicId) {
    resumeLink.hidden = true;
    resumeLink.href = "/";
    return;
  }
  resumeLink.href = `/replay/${encodeURIComponent(publicId)}`;
  resumeLink.hidden = false;
}

export function updateTopNav() {
  const profileLink = document.getElementById("myProfileLink");
  if (!profileLink) return;
  const playerId = getPlayerIdOrNull();
  profileLink.href = playerId ? `/p/${encodeURIComponent(playerId)}` : "/";
  updateResumeReplayLink();
}

export async function getProfile(playerId) {
  return api(`/api/players/${encodeURIComponent(playerId)}`);
}

export async function createChallenge(playerId, creatureA) {
  return api("/api/challenges", {
    method: "POST",
    body: JSON.stringify({ playerAId: playerId, creatureA }),
  });
}

export async function getChallenge(token) {
  return api(`/api/challenges/${encodeURIComponent(token)}`);
}

export async function acceptChallenge(token, playerId, creatureB) {
  return api(`/api/challenges/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body: JSON.stringify({ playerBId: playerId, creatureB }),
  });
}

export async function submitMoves(matchId, side, moves) {
  return api(`/api/matches/${encodeURIComponent(matchId)}/moves`, {
    method: "POST",
    body: JSON.stringify({ side, moves }),
  });
}

export async function getMatch(matchId) {
  return api(`/api/matches/${encodeURIComponent(matchId)}`);
}

export async function fetchReplay(publicId) {
  return api(`/api/replay/${encodeURIComponent(publicId)}`);
}

export async function createRematch(publicId, playerId, side) {
  return api(`/api/rematch/${encodeURIComponent(publicId)}`, {
    method: "POST",
    body: JSON.stringify({ playerId, side }),
  });
}

export async function shareReplay(publicId, playerId) {
  return api(`/api/replay/${encodeURIComponent(publicId)}/share`, {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });
}

let routeDebugLogged = false;

export function parsePath() {
  const parts = location.pathname.split("/").filter(Boolean);
  if (!routeDebugLogged) {
    routeDebugLogged = true;
    console.log(`[app] route path=${location.pathname} parts=${parts.join("/") || "(root)"}`);
  }
  return parts;
}

export function q(name) {
  return new URLSearchParams(location.search).get(name);
}

export function creatureFromDom(prefix) {
  const classKey = document.getElementById(`${prefix}-class`).value;
  const cosmeticSeed = Number.parseInt(document.getElementById(`${prefix}-seed`).value, 10);
  if (!CLASS_KEYS.includes(classKey)) throw new Error("Invalid class key");
  return { classKey, cosmeticSeed };
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

export function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}

export function setProfileBar(el, profile) {
  el.textContent = `⛽ GasCoins ${profile.gasCoins} · 🦨 StinkFame ${profile.stinkFame} · W${profile.wins}/L${profile.losses}/D${profile.draws}`;
}
