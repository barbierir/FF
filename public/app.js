const CLASS_KEYS = ["goblin", "dragon", "skunk", "troll", "fairy", "demon"];
export const CREATURES = [
  {
    id: "goblin",
    name: "Goblin",
    idleSrc: "/creatures/idle/goblin.gif",
    blurb: "Efficient gas economy specialist.",
    specialAbilityName: "RECHARGE_EXTRA bonus",
    specialAbilityDescription: "RECHARGE_EXTRA restores 3 PG for goblin instead of the default 2.",
  },
  {
    id: "dragon",
    name: "Dragon",
    idleSrc: "/creatures/idle/dragon.gif",
    blurb: "High-pressure attacker.",
    specialAbilityName: "DRAGON_PLUS1",
    specialAbilityDescription: "Dragon ATTACK actions apply +1 extra damage compared to base ATTACK damage.",
  },
  {
    id: "skunk",
    name: "Skunk",
    idleSrc: "/creatures/idle/slime.gif",
    blurb: "Risk-control attacker.",
    specialAbilityName: "SKUNK_SAFE_USED",
    specialAbilityDescription: "One ATTACK can consume safe=true to prevent BACKFIRE once per match.",
  },
  {
    id: "troll",
    name: "Troll",
    idleSrc: "/creatures/idle/skeleton.gif",
    blurb: "Retaliation-focused defender.",
    specialAbilityName: "TROLL_RETAL",
    specialAbilityDescription: "When troll takes non-zero attack damage, the attacker takes 1 retaliation damage.",
  },
  {
    id: "fairy",
    name: "Fairy",
    idleSrc: "/creatures/idle/wizard.gif",
    blurb: "Sustain and recovery specialist.",
    specialAbilityName: "HEAL",
    specialAbilityDescription: "Only fairy can use HEAL when PG >= 1; HEAL restores PR (2, or 3 when PR <= 7).",
  },
  {
    id: "demon",
    name: "Demon",
    idleSrc: "/creatures/idle/demon.gif",
    blurb: "Volatile all-rounder.",
    specialAbilityName: "BASE KIT",
    specialAbilityDescription: "Demon uses the baseline move kit without class-specific modifiers.",
  },
];

const CREATURE_NICKNAME_PARTS = {
  goblin: {
    first: ["Grime", "Snag", "Muck", "Rivet", "Sprocket", "Stink", "Scrap", "Bog"],
    second: ["snout", "tooth", "fizz", "belch", "burp", "whistle", "wrench", "spark"],
  },
  dragon: {
    first: ["Ember", "Ash", "Blaze", "Scorch", "Cinder", "Inferno", "Pyre", "Flare"],
    second: ["wing", "fang", "flare", "roar", "smoke", "ember", "burn", "scale"],
  },
  skunk: {
    first: ["Whiff", "Puff", "Stink", "Misty", "Cloud", "Fume", "Scent", "Spritz"],
    second: ["tail", "trail", "blast", "mist", "spray", "drift", "haze", "burst"],
  },
  troll: {
    first: ["Boulder", "Grunt", "Stomp", "Rubble", "Crag", "Moss", "Thud", "Bash"],
    second: ["hide", "club", "smash", "echo", "belch", "guard", "stone", "rumble"],
  },
  fairy: {
    first: ["Twinkle", "Glow", "Sparkle", "Petal", "Moon", "Luna", "Wisp", "Dew"],
    second: ["dust", "gleam", "flutter", "song", "bloom", "drift", "mist", "shine"],
  },
  demon: {
    first: ["Hex", "Night", "Rift", "Vex", "Infer", "Shade", "Dread", "Soot"],
    second: ["claw", "flame", "howl", "smoke", "horn", "ember", "fang", "gloom"],
  },
};

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function generateCreatureNickname(creatureId) {
  const pool = CREATURE_NICKNAME_PARTS[creatureId] ?? CREATURE_NICKNAME_PARTS.goblin;
  return `${randomItem(pool.first)} ${randomItem(pool.second)}`;
}

export function renderCreaturePickerGrid({
  container,
  selectedId,
  onSelect,
}) {
  if (!container) return;
  container.innerHTML = "";

  for (const creature of CREATURES) {
    const tile = document.createElement("article");
    tile.className = `creature-select-tile${selectedId === creature.id ? " selected" : ""}`;
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
    tile.setAttribute("aria-label", `Select ${creature.name}`);

    const imageWrap = document.createElement("div");
    imageWrap.className = "creature-select-image";

    const img = document.createElement("img");
    img.src = creature.idleSrc;
    img.alt = `${creature.name} idle`;
    img.loading = "lazy";
    img.width = 220;
    img.height = 220;
    img.onerror = () => {
      console.warn("Creature GIF failed", creature.id, creature.idleSrc);
    };
    imageWrap.appendChild(img);

    const name = document.createElement("h3");
    name.textContent = creature.name;

    const blurb = document.createElement("p");
    blurb.className = "small";
    blurb.textContent = creature.blurb;

    const overlay = document.createElement("div");
    overlay.className = "creature-select-overlay";
    overlay.innerHTML = `<strong>Special: ${creature.specialAbilityName}</strong><p>${creature.specialAbilityDescription}</p>`;

    const badge = document.createElement("span");
    badge.className = "selected-badge";
    badge.textContent = "Selected";
    badge.hidden = selectedId !== creature.id;

    const select = () => onSelect(creature.id);
    tile.onclick = select;
    tile.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    };

    tile.append(imageWrap, name, blurb, overlay, badge);
    container.appendChild(tile);
  }
}

const PLAYER_ID_KEY = "faf_playerId";
const LEGACY_PLAYER_ID_KEY = "faf_player_id";
const LAST_REPLAY_PUBLIC_ID_KEY = "faf_lastReplayPublicId";
const FORCE_NEW_QUERY_KEY = "new";
const FORCE_NEW_QUERY_VALUE = "1";

const PLAYER_CREATURE_PREFIX = "ff:player:";
const PLAYER_CREATURE_SUFFIX = ":creatureId";
const PLAYER_CREATURE_NICKNAME_SUFFIX = ":creatureNickname";
const LEGACY_PLAYER_CREATURE_PREFIX = "faf_playerCreature_";
const PENDING_CREATURE_KEY = "ff:pendingCreatureId";
const PENDING_CREATURE_NICKNAME_KEY = "ff:pendingCreatureNickname";

function playerCreatureStorageKey(playerId) {
  return `${PLAYER_CREATURE_PREFIX}${playerId}${PLAYER_CREATURE_SUFFIX}`;
}

function legacyPlayerCreatureStorageKey(playerId) {
  return `${LEGACY_PLAYER_CREATURE_PREFIX}${playerId}`;
}

function playerCreatureNicknameStorageKey(playerId) {
  return `${PLAYER_CREATURE_PREFIX}${playerId}${PLAYER_CREATURE_NICKNAME_SUFFIX}`;
}

export function getPlayerCreatureId(playerId) {
  if (!playerId) return null;
  return localStorage.getItem(playerCreatureStorageKey(playerId)) ?? localStorage.getItem(legacyPlayerCreatureStorageKey(playerId));
}

export function setPlayerCreatureId(playerId, creatureId) {
  if (!playerId || !creatureId) return;
  localStorage.setItem(playerCreatureStorageKey(playerId), creatureId);
  localStorage.removeItem(legacyPlayerCreatureStorageKey(playerId));
}

export function clearPlayerCreatureId(playerId) {
  if (!playerId) return;
  localStorage.removeItem(playerCreatureStorageKey(playerId));
  localStorage.removeItem(legacyPlayerCreatureStorageKey(playerId));
}

export function getPlayerCreatureNickname(playerId) {
  if (!playerId) return null;
  return localStorage.getItem(playerCreatureNicknameStorageKey(playerId));
}

export function setPlayerCreatureNickname(playerId, nickname) {
  if (!playerId || !nickname) return;
  localStorage.setItem(playerCreatureNicknameStorageKey(playerId), nickname);
}

export function clearPlayerCreatureNickname(playerId) {
  if (!playerId) return;
  localStorage.removeItem(playerCreatureNicknameStorageKey(playerId));
}

export function getPendingCreatureId() {
  return localStorage.getItem(PENDING_CREATURE_KEY);
}

export function setPendingCreatureId(creatureId) {
  if (!creatureId) return;
  localStorage.setItem(PENDING_CREATURE_KEY, creatureId);
}

export function getPendingCreatureNickname() {
  return localStorage.getItem(PENDING_CREATURE_NICKNAME_KEY);
}

export function setPendingCreatureNickname(nickname) {
  if (!nickname) return;
  localStorage.setItem(PENDING_CREATURE_NICKNAME_KEY, nickname);
}

export function getPendingCreatureSelection() {
  const creatureId = getPendingCreatureId();
  const nickname = getPendingCreatureNickname();
  if (!creatureId || !nickname) return null;
  return { creatureId, nickname };
}

export function setPendingCreatureSelection({ creatureId, nickname }) {
  if (!creatureId || !nickname) return;
  setPendingCreatureId(creatureId);
  setPendingCreatureNickname(nickname);
}

export function clearPendingCreatureSelection() {
  localStorage.removeItem(PENDING_CREATURE_KEY);
  localStorage.removeItem(PENDING_CREATURE_NICKNAME_KEY);
}

export function flushPendingCreatureIdToPlayer(playerId) {
  if (!playerId) return null;
  const pending = getPendingCreatureSelection();
  if (!pending) return null;
  setPlayerCreatureId(playerId, pending.creatureId);
  setPlayerCreatureNickname(playerId, pending.nickname);
  clearPendingCreatureSelection();
  return pending.creatureId;
}

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

export async function getViewerPlayerId() {
  return getOrCreateGuestPlayer();
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

async function getProfileWithTimeout(playerId, timeoutMs = 10000) {
  return Promise.race([
    getProfile(playerId),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Profile fetch timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

export async function loadViewerProfileBar({ profileBarEl, playerId, onLoaded } = {}) {
  if (!profileBarEl) return;
  if (!playerId) {
    profileBarEl.textContent = "Profile unavailable";
    return;
  }

  const renderLoadError = (errorMessage) => {
    profileBarEl.replaceChildren();
    const text = document.createElement("span");
    text.textContent = "Failed to load profile.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "secondary";
    retry.textContent = "Retry";
    retry.style.marginLeft = "8px";
    retry.onclick = () => {
      void attemptLoad();
    };
    profileBarEl.append(text, retry);
    console.debug(`[profile] render load error playerId=${playerId} reason=${errorMessage}`);
  };

  const attemptLoad = async () => {
    profileBarEl.textContent = "Loading profile…";
    console.debug(`[profile] load start playerId=${playerId}`);
    try {
      const profileData = await getProfileWithTimeout(playerId);
      setProfileBar(profileBarEl, profileData.profile);
      onLoaded?.(profileData);
      console.debug(`[profile] load success playerId=${playerId}`);
      return profileData;
    } catch (error) {
      console.debug(`[profile] load fail playerId=${playerId}`, error);
      renderLoadError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      console.debug(`[profile] load finalize playerId=${playerId} loading=false`);
    }
  };

  return attemptLoad();
}

export async function createChallenge(playerId, creatureA, creatureId = null) {
  return api("/api/challenges", {
    method: "POST",
    body: JSON.stringify({ playerAId: playerId, creatureA, creatureId }),
  });
}

export async function getChallenge(token, viewerId) {
  const params = new URLSearchParams();
  if (viewerId) params.set("viewerId", viewerId);
  const query = params.toString();
  return api(`/api/challenges/${encodeURIComponent(token)}${query ? `?${query}` : ""}`);
}

export async function acceptChallenge(token, playerId, creatureB, creatureId = null) {
  return api(`/api/challenges/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body: JSON.stringify({ playerBId: playerId, creatureB, creatureId }),
  });
}

export async function submitMoves(matchId, side, moves, playerId) {
  return api(`/api/matches/${encodeURIComponent(matchId)}/moves`, {
    method: "POST",
    body: JSON.stringify({ side, moves, playerId }),
  });
}

export async function getMatch(matchId) {
  return api(`/api/matches/${encodeURIComponent(matchId)}`);
}

export async function fetchReplay(publicId) {
  return api(`/api/replay/${encodeURIComponent(publicId)}`);
}


export async function fetchOpenChallenges(excludePlayerId, limit = 20) {
  const params = new URLSearchParams();
  if (excludePlayerId) params.set("excludePlayerId", excludePlayerId);
  params.set("limit", String(limit));
  return api(`/api/challenges/open?${params.toString()}`);
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
  const classNode = document.getElementById(`${prefix}-class`);
  const classKey = classNode?.value;
  if (!CLASS_KEYS.includes(classKey)) throw new Error("Invalid class key");
  return { classKey, cosmeticSeed: randomSeed() };
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

export function getGasRankTitle(wins) {
  if (wins <= 1) return "Gas Trainee";
  if (wins <= 3) return "Odor Apprentice";
  if (wins <= 6) return "Toxic Specialist";
  if (wins <= 9) return "Fume Overlord";
  return "Supreme Gas Lord 👑";
}

const IDLE_ASSET_BY_CLASS = {
  goblin: "goblin",
  dragon: "dragon",
  skunk: "slime",
  troll: "skeleton",
  fairy: "wizard",
  demon: "demon",
};

const isDevHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

export function renderCreatureIdle(container, { classKey, size = 72, alt } = {}) {
  if (!container) return;
  const label = classKey || "unknown";
  const assetKey = IDLE_ASSET_BY_CLASS[label] || label;

  const img = document.createElement("img");
  img.width = size;
  img.height = size;
  img.className = "creature-idle";

  const showFallback = () => {
    container.innerHTML = "";
    const fallback = document.createElement("div");
    fallback.className = "creature-fallback";
    fallback.style.width = `${size}px`;
    fallback.style.height = `${size}px`;
    fallback.setAttribute("aria-label", alt || `${label} idle fallback`);

    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "💨";

    const text = document.createElement("span");
    text.textContent = label;

    fallback.append(icon, text);
    container.appendChild(fallback);
  };

  let triedGif = false;
  img.onerror = () => {
    if (isDevHost) {
      console.warn("[renderCreatureIdle] failed to load idle image", {
        creatureId: label,
        attemptedSrc: img.currentSrc || img.src,
      });
    }
    if (!triedGif) {
      triedGif = true;
      img.src = `/creatures/idle/${encodeURIComponent(assetKey)}.gif`;
      return;
    }
    showFallback();
  };

  img.alt = alt || `${label} idle creature`;
  img.src = `/creatures/idle/${encodeURIComponent(assetKey)}.webp`;
  container.innerHTML = "";
  container.appendChild(img);
}

const PLAYER_IDENTITY_VARIANT_SIZE = {
  compact: 44,
  default: 72,
  hero: 132,
};

function findCreature(creatureId) {
  if (!creatureId) return null;
  return CREATURES.find((creature) => creature.id === creatureId) ?? null;
}

function normalizeNickname(creatureNickname) {
  if (!creatureNickname) return null;
  const trimmed = creatureNickname.trim();
  return trimmed || null;
}

function toTitleCase(value) {
  if (!value) return "Unknown Creature";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function getCreaturePresentation(playerId, creatureId, creatureNickname) {
  const creature = findCreature(creatureId);
  const nickname = normalizeNickname(creatureNickname);
  const creatureName = creature?.name ?? (creatureId ? toTitleCase(creatureId) : "Unknown Creature");
  const resolvedPlayerId = playerId || "Unknown Player";
  const primaryLabel = nickname || creatureName;
  return {
    creature,
    nickname,
    creatureName,
    playerId: resolvedPlayerId,
    primaryLabel,
  };
}

export function createPlayerIdentity({
  playerId,
  creatureId = null,
  creatureNickname = null,
  variant = "default",
  showGif = true,
  showCreatureName = true,
  showPlayerId = true,
  showNickname = true,
  className = "",
} = {}) {
  const presentation = getCreaturePresentation(playerId, creatureId, creatureNickname);
  const identity = document.createElement("div");
  identity.className = `player-identity player-identity--${variant}${className ? ` ${className}` : ""}`;

  if (showGif) {
    const avatar = document.createElement("div");
    avatar.className = "player-identity__avatar";
    renderCreatureIdle(avatar, {
      classKey: creatureId || presentation.creature?.id || null,
      size: PLAYER_IDENTITY_VARIANT_SIZE[variant] ?? PLAYER_IDENTITY_VARIANT_SIZE.default,
      alt: `${presentation.primaryLabel} creature idle`,
    });
    identity.appendChild(avatar);
  }

  const text = document.createElement("div");
  text.className = "player-identity__text";

  if (showNickname || !presentation.nickname) {
    const primary = document.createElement("div");
    primary.className = "player-identity__primary";
    primary.textContent = presentation.primaryLabel;
    text.appendChild(primary);
  }

  const meta = [];
  if (showCreatureName && presentation.nickname) {
    meta.push(presentation.creatureName);
  }
  if (showPlayerId) {
    meta.push(`@${presentation.playerId}`);
  }

  if (meta.length) {
    const secondary = document.createElement("div");
    secondary.className = "player-identity__secondary";
    secondary.textContent = meta.join(" · ");
    text.appendChild(secondary);
  }

  identity.appendChild(text);
  return identity;
}

export function renderPlayerIdentity(container, options) {
  if (!container) return;
  container.replaceChildren(createPlayerIdentity(options));
}
