import { getCreatureSelectionIdlePath, getHomepageCreatureIdleCandidates, loadImageWithFallback } from '/creatureAnimations.js';
import { getMasterVolume, isMuted, setMasterVolume, syncMusicForCurrentPage, toggleMuted } from '/audioManager.js';
const CLASS_KEYS = ["goblin", "dragon", "skunk", "troll", "fairy", "demon"];
const LOGGED_BROWSER_WARNINGS = new Set();

function logBrowserGuardWarning(scope, detail, error) {
  const key = `${scope}:${detail}`;
  if (LOGGED_BROWSER_WARNINGS.has(key)) return;
  LOGGED_BROWSER_WARNINGS.add(key);
  if (error) {
    console.warn(`[app] ${scope} unavailable (${detail})`, error);
  } else {
    console.warn(`[app] ${scope} unavailable (${detail})`);
  }
}

function getWindowOrNull() {
  return typeof window === 'undefined' ? null : window;
}

function readLocalStorage(key) {
  try {
    return getWindowOrNull()?.localStorage?.getItem(key) ?? null;
  } catch (error) {
    logBrowserGuardWarning('localStorage', `read:${key}`, error);
    return null;
  }
}

function writeLocalStorage(key, value) {
  try {
    getWindowOrNull()?.localStorage?.setItem(key, value);
    return true;
  } catch (error) {
    logBrowserGuardWarning('localStorage', `write:${key}`, error);
    return false;
  }
}

function removeLocalStorage(key) {
  try {
    getWindowOrNull()?.localStorage?.removeItem(key);
    return true;
  } catch (error) {
    logBrowserGuardWarning('localStorage', `remove:${key}`, error);
    return false;
  }
}

function removeSessionStorage(key) {
  try {
    getWindowOrNull()?.sessionStorage?.removeItem(key);
    return true;
  } catch (error) {
    logBrowserGuardWarning('sessionStorage', `remove:${key}`, error);
    return false;
  }
}

function getLocationOrNull() {
  return getWindowOrNull()?.location ?? null;
}

const VALID_CREATURE_IDS = new Set(CLASS_KEYS);
export const CREATURES = [
  {
    id: "goblin",
    name: "Goblin",
    idleSrc: getCreatureSelectionIdlePath('goblin'),
    blurb: "Efficient gas economy specialist.",
    specialAbilityName: "RECHARGE_EXTRA bonus",
    specialAbilityDescription: "RECHARGE_EXTRA restores 3 PG for goblin instead of the default 2.",
  },
  {
    id: "dragon",
    name: "Dragon",
    idleSrc: getCreatureSelectionIdlePath('dragon'),
    blurb: "High-pressure attacker.",
    specialAbilityName: "DRAGON_PLUS1",
    specialAbilityDescription: "Dragon ATTACK actions apply +1 extra damage compared to base ATTACK damage.",
  },
  {
    id: "skunk",
    name: "Skunk",
    idleSrc: getCreatureSelectionIdlePath('skunk'),
    blurb: "Risk-control attacker.",
    specialAbilityName: "SKUNK_SAFE_USED",
    specialAbilityDescription: "One ATTACK can consume safe=true to prevent BACKFIRE once per match.",
  },
  {
    id: "troll",
    name: "Troll",
    idleSrc: getCreatureSelectionIdlePath('troll'),
    blurb: "Retaliation-focused defender.",
    specialAbilityName: "TROLL_RETAL",
    specialAbilityDescription: "When troll takes non-zero attack damage, the attacker takes 1 retaliation damage.",
  },
  {
    id: "fairy",
    name: "Fairy",
    idleSrc: getCreatureSelectionIdlePath('fairy'),
    blurb: "Sustain and recovery specialist.",
    specialAbilityName: "HEAL",
    specialAbilityDescription: "Only fairy can use HEAL when PG >= 1; HEAL restores PR (2, or 3 when PR <= 7).",
  },
  {
    id: "demon",
    name: "Demon",
    idleSrc: getCreatureSelectionIdlePath('demon'),
    blurb: "Volatile all-rounder.",
    specialAbilityName: "BASE KIT",
    specialAbilityDescription: "Demon uses the baseline move kit without class-specific modifiers.",
  },
];

const AVATAR_SIZES = {
  sm: 44,
  md: 72,
  lg: 132,
};

const PLAYER_IDENTITY_VARIANT_SIZE = {
  compact: AVATAR_SIZES.sm,
  default: AVATAR_SIZES.md,
  hero: AVATAR_SIZES.lg,
};

const STATUS_BADGE_VARIANTS = new Set(["success", "danger", "neutral", "highlight", "rank", "daily"]);

function resolveAvatarSize(size) {
  if (typeof size === "number" && Number.isFinite(size) && size > 0) return size;
  return AVATAR_SIZES[size] ?? AVATAR_SIZES.md;
}

function createCreatureFallback(size, alt) {
  const fallback = document.createElement("div");
  fallback.className = "creature-fallback";
  fallback.style.width = `${size}px`;
  fallback.style.height = `${size}px`;
  fallback.setAttribute("role", "img");
  fallback.setAttribute("aria-label", alt || "Missing GIF");
  fallback.textContent = "Missing GIF";
  return fallback;
}

export function createStatusBadge({ label, variant = "neutral", size = "md", extraClass = "" } = {}) {
  const badge = document.createElement("span");
  const safeVariant = STATUS_BADGE_VARIANTS.has(variant) ? variant : "neutral";
  const safeSize = size === "sm" ? "sm" : "md";
  badge.className = `status-badge status-badge--${safeVariant} status-badge--${safeSize}${extraClass ? ` ${extraClass}` : ""}`;
  badge.textContent = label;
  return badge;
}

export function renderStatusBadge(container, options) {
  if (!container) return;
  container.replaceChildren(createStatusBadge(options));
}

export function outcomeToBadgeVariant(outcome) {
  if (outcome === "Victory") return "success";
  if (outcome === "Defeat") return "danger";
  return "neutral";
}

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
    const isSelected = selectedId === creature.id;
    const tile = document.createElement("article");
    tile.className = `creature-select-tile${isSelected ? " selected" : ""}`;
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
    tile.setAttribute("aria-label", `Select ${creature.name}`);

    const imageWrap = document.createElement("div");
    imageWrap.className = "creature-select-image";

    const img = document.createElement("img");
    img.alt = `${creature.name} idle`;
    img.loading = "lazy";
    img.width = 132;
    img.height = 132;
    const idleCandidates = getHomepageCreatureIdleCandidates(creature.id);
    img.onerror = () => {
      imageWrap.replaceChildren(createCreatureFallback(132, `${creature.name} missing GIF`));
    };
    imageWrap.appendChild(img);
    loadImageWithFallback(img, idleCandidates, {
      creatureId: creature.id,
      animationName: 'idle_choose',
      logPrefix: '[creature-picker]',
    });

    const name = document.createElement("h3");
    name.textContent = creature.name;

    const blurb = document.createElement("p");
    blurb.className = "small";
    blurb.textContent = creature.blurb;

    const overlay = document.createElement("div");
    overlay.className = "creature-select-overlay";
    overlay.innerHTML = `<strong>Special: ${creature.specialAbilityName}</strong><p>${creature.specialAbilityDescription}</p>`;

    const badge = isSelected
      ? createStatusBadge({
          label: "Selected",
          variant: "highlight",
          size: "sm",
          extraClass: "selected-badge",
        })
      : null;

    const select = () => onSelect(creature.id);
    tile.onclick = select;
    tile.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    };

    tile.append(imageWrap, name, blurb, overlay);
    if (badge) {
      tile.appendChild(badge);
    }
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
  const stored = readLocalStorage(playerCreatureStorageKey(playerId)) ?? readLocalStorage(legacyPlayerCreatureStorageKey(playerId));
  return VALID_CREATURE_IDS.has(stored) ? stored : null;
}

export function setPlayerCreatureId(playerId, creatureId) {
  if (!playerId || !creatureId) return;
  if (!VALID_CREATURE_IDS.has(creatureId)) return;
  writeLocalStorage(playerCreatureStorageKey(playerId), creatureId);
  removeLocalStorage(legacyPlayerCreatureStorageKey(playerId));
}

export function clearPlayerCreatureId(playerId) {
  if (!playerId) return;
  removeLocalStorage(playerCreatureStorageKey(playerId));
  removeLocalStorage(legacyPlayerCreatureStorageKey(playerId));
}

export function getPlayerCreatureNickname(playerId) {
  if (!playerId) return null;
  return readLocalStorage(playerCreatureNicknameStorageKey(playerId));
}

export function setPlayerCreatureNickname(playerId, nickname) {
  if (!playerId || !nickname) return;
  writeLocalStorage(playerCreatureNicknameStorageKey(playerId), nickname);
}

export function clearPlayerCreatureNickname(playerId) {
  if (!playerId) return;
  removeLocalStorage(playerCreatureNicknameStorageKey(playerId));
}

export function getPendingCreatureId() {
  const stored = readLocalStorage(PENDING_CREATURE_KEY);
  return VALID_CREATURE_IDS.has(stored) ? stored : null;
}

export function setPendingCreatureId(creatureId) {
  if (!creatureId) return;
  if (!VALID_CREATURE_IDS.has(creatureId)) return;
  writeLocalStorage(PENDING_CREATURE_KEY, creatureId);
}

export function getPendingCreatureNickname() {
  return readLocalStorage(PENDING_CREATURE_NICKNAME_KEY);
}

export function setPendingCreatureNickname(nickname) {
  if (!nickname) return;
  writeLocalStorage(PENDING_CREATURE_NICKNAME_KEY, nickname);
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
  removeLocalStorage(PENDING_CREATURE_KEY);
  removeLocalStorage(PENDING_CREATURE_NICKNAME_KEY);
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
  const search = getLocationOrNull()?.search ?? "";
  return new URLSearchParams(search).get(FORCE_NEW_QUERY_KEY) === FORCE_NEW_QUERY_VALUE;
}

function clearStickyResumeState() {
  for (const key of STICKY_RESUME_KEYS) {
    try {
      removeLocalStorage(key);
    } catch {}
    try {
      removeSessionStorage(key);
    } catch {}
  }
}

let forceNewModeCache = null;

function getForceNewModeFlag() {
  if (forceNewModeCache !== null) return forceNewModeCache;
  forceNewModeCache = forceNewChallengeRequested();
  if (forceNewModeCache) clearStickyResumeState();
  return forceNewModeCache;
}

export function shouldSkipAutoResume() {
  return Boolean(getForceNewModeFlag());
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
  const playerId = readLocalStorage(PLAYER_ID_KEY);
  if (playerId) return playerId;
  const legacyPlayerId = readLocalStorage(LEGACY_PLAYER_ID_KEY);
  if (!legacyPlayerId) return null;
  writeLocalStorage(PLAYER_ID_KEY, legacyPlayerId);
  removeLocalStorage(LEGACY_PLAYER_ID_KEY);
  return legacyPlayerId;
}

export async function getOrCreateGuestPlayer() {
  let playerId = getPlayerIdOrNull();
  if (playerId) return playerId;
  const created = await api("/api/players/guest", { method: "POST", body: "{}" });
  playerId = created.playerId;
  writeLocalStorage(PLAYER_ID_KEY, playerId);
  return playerId;
}

export async function getViewerPlayerId() {
  return getOrCreateGuestPlayer();
}

export function rememberLastReplayPublicId(publicId) {
  if (shouldSkipAutoResume()) return;
  if (!publicId) return;
  writeLocalStorage(LAST_REPLAY_PUBLIC_ID_KEY, publicId);
}

export function updateResumeReplayLink() {
  const resumeLink = document.getElementById("navResumeReplay");
  if (!resumeLink) return;
  if (shouldSkipAutoResume()) {
    resumeLink.hidden = true;
    resumeLink.href = "/";
    return;
  }
  const publicId = readLocalStorage(LAST_REPLAY_PUBLIC_ID_KEY);
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
  const playerId = getPlayerIdOrNull();
  if (profileLink) {
    profileLink.href = playerId ? `/p/${encodeURIComponent(playerId)}` : "/";
  }

  const pathname = getLocationOrNull()?.pathname ?? "/";
  const activeNav = pathname === "/" || pathname === "/home"
    ? "home"
    : pathname.startsWith("/p/")
      ? "profile"
      : pathname.startsWith("/leaderboard")
        ? "leaderboard"
        : pathname.startsWith("/daily")
          ? "daily"
          : null;

  document.querySelectorAll(".topbar .nav-links a[data-nav]").forEach((link) => {
    const isActive = link.dataset.nav === activeNav;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  updateResumeReplayLink();
  ensureAudioControls();
  try {
    syncMusicForCurrentPage(pathname);
  } catch (error) {
    logBrowserGuardWarning('audio', 'syncMusicForCurrentPage', error);
  }
}

function ensureAudioControls() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  if (topbar.querySelector('[data-audio-controls]')) return;

  const wrap = document.createElement('div');
  wrap.className = 'audio-controls';
  wrap.setAttribute('data-audio-controls', 'true');

  const muteButton = document.createElement('button');
  muteButton.type = 'button';
  muteButton.className = 'secondary audio-mute-btn';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.className = 'audio-volume-slider';
  slider.setAttribute('aria-label', 'Master volume');

  const volumeLabel = document.createElement('span');
  volumeLabel.className = 'small audio-volume-value';

  const refreshUi = () => {
    const muted = isMuted();
    const volumePct = Math.round(getMasterVolume() * 100);
    muteButton.textContent = muted ? '🔇' : '🔊';
    muteButton.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    slider.value = String(volumePct);
    volumeLabel.textContent = `${volumePct}%`;
  };

  muteButton.addEventListener('click', () => {
    toggleMuted();
    refreshUi();
  });

  slider.addEventListener('input', () => {
    setMasterVolume(Number(slider.value) / 100);
    refreshUi();
  });

  refreshUi();
  wrap.append(muteButton, slider, volumeLabel);
  topbar.appendChild(wrap);
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
    profileBarEl.textContent = "Loading...";
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

export async function createChallenge(playerId, creatureA, creatureId = null, mode = "auto") {
  return api("/api/challenges", {
    method: "POST",
    body: JSON.stringify({ playerAId: playerId, creatureA, creatureId, creatureNickname: getPlayerCreatureNickname(playerId), mode }),
  });
}

export async function listMyChallenges(playerId, status = "open", limit = 20) {
  const params = new URLSearchParams({
    playerId,
    status,
    limit: String(limit),
  });
  return api(`/api/challenges/mine?${params.toString()}`);
}

export function getShareableChallengeUrl(challengeOrMatch) {
  if (!challengeOrMatch || typeof challengeOrMatch !== "object") return null;
  if (typeof challengeOrMatch.shareUrl === "string" && challengeOrMatch.shareUrl) {
    return challengeOrMatch.shareUrl;
  }
  const token = challengeOrMatch.token || challengeOrMatch.challengeToken;
  if (typeof token === "string" && token) {
    const origin = getLocationOrNull()?.origin;
    return origin ? `${origin}/c/${token}` : null;
  }
  const relativeUrl = challengeOrMatch.url;
  if (typeof relativeUrl === "string" && relativeUrl.startsWith("/c/")) {
    const origin = getLocationOrNull()?.origin;
    return origin ? `${origin}${relativeUrl}` : null;
  }
  return null;
}

export function buildChallengeShareText({ challengerLabel, opponentLabel } = {}) {
  const challenger = (challengerLabel || "A Challenger").trim();
  const opponent = (opponentLabel || "").trim();
  if (opponent) {
    return `${challenger} challenges ${opponent} in Fart and Furious!`;
  }
  return `${challenger} is looking for a challenger in Fart and Furious!`;
}

export function renderChallengeShareActions(container, { url, message, onCopyStateChange } = {}) {
  if (!container) return;
  container.replaceChildren();
  if (!url) {
    container.hidden = true;
    return;
  }

  const text = [message, url].filter(Boolean).join(" ");
  const heading = document.createElement("h3");
  heading.textContent = "Share Your Challenge";
  heading.className = "challenge-share-title";

  const helper = document.createElement("p");
  helper.className = "challenge-share-helper";
  helper.textContent = "Invite another creature to join the arena.";

  const actions = document.createElement("div");
  actions.className = "challenge-share-actions";

  function createShareIcon(iconName) {
    const icon = document.createElement("span");
    icon.className = "challenge-share-icon";
    if (iconName === "whatsapp") {
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.47 14.38c-.27-.14-1.58-.78-1.83-.87-.24-.09-.42-.14-.6.14-.18.27-.69.87-.85 1.05-.15.18-.31.2-.58.07-.27-.14-1.13-.41-2.16-1.31-.8-.71-1.34-1.58-1.5-1.85-.15-.27-.02-.42.11-.56.12-.12.27-.31.4-.47.13-.16.18-.27.27-.45.09-.18.05-.34-.02-.47-.07-.14-.6-1.44-.82-1.97-.22-.53-.44-.45-.6-.46-.15-.01-.34-.01-.52-.01-.18 0-.47.07-.72.34-.24.27-.92.9-.92 2.2 0 1.3.94 2.56 1.07 2.74.13.18 1.84 2.81 4.45 3.93.62.27 1.11.42 1.49.53.63.2 1.2.17 1.65.1.5-.07 1.58-.64 1.8-1.27.22-.63.22-1.16.15-1.27-.06-.11-.24-.18-.51-.32z"/></svg>';
    } else if (iconName === "facebook") {
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.87.25-1.46 1.5-1.46h1.64V5c-.28-.04-1.23-.12-2.34-.12-2.31 0-3.89 1.41-3.89 4v2.23H8v3h2.9v8h2.6z"/></svg>';
    } else {
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>';
    }
    return icon;
  }

  function createShareLabel(label) {
    const textNode = document.createElement("span");
    textNode.className = "challenge-share-label";
    textNode.textContent = label;
    return textNode;
  }

  const whatsapp = document.createElement("a");
  whatsapp.className = "button-link secondary challenge-share-button challenge-share-button--whatsapp";
  whatsapp.append(createShareIcon("whatsapp"), createShareLabel("WhatsApp"));
  whatsapp.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  whatsapp.target = "_blank";
  whatsapp.rel = "noopener noreferrer";

  const facebook = document.createElement("a");
  facebook.className = "button-link secondary challenge-share-button challenge-share-button--facebook";
  facebook.append(createShareIcon("facebook"), createShareLabel("Facebook"));
  facebook.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  facebook.target = "_blank";
  facebook.rel = "noopener noreferrer";

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "secondary challenge-share-button challenge-share-button--copy";
  const copyLabel = createShareLabel("Copy");
  copy.append(createShareIcon("copy"), copyLabel);
  let copyResetTimer = null;
  copy.onclick = async () => {
    try {
      await copyText(url);
      copyLabel.textContent = "Copied";
      copy.classList.add("is-copied");
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copyLabel.textContent = "Copy";
        copy.classList.remove("is-copied");
      }, 1800);
      onCopyStateChange?.("Copied", false);
    } catch {
      onCopyStateChange?.("Could not copy link", true);
    }
  };

  actions.append(whatsapp, facebook, copy);
  container.append(heading, helper, actions);
  container.hidden = false;
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
    body: JSON.stringify({ playerBId: playerId, creatureB, creatureId, creatureNickname: getPlayerCreatureNickname(playerId) }),
  });
}

export async function submitMoves(matchId, side, moves, playerId) {
  return api(`/api/matches/${encodeURIComponent(matchId)}/moves`, {
    method: "POST",
    body: JSON.stringify({ side, moves, playerId }),
  });
}


export async function submitAction(matchId, action, playerId) {
  return api(`/api/matches/${encodeURIComponent(matchId)}/action`, {
    method: "POST",
    body: JSON.stringify({ action, playerId }),
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

export function parsePath() {
  const pathname = getLocationOrNull()?.pathname ?? "";
  return pathname.split("/").filter(Boolean);
}

export function q(name) {
  const search = getLocationOrNull()?.search ?? "";
  return new URLSearchParams(search).get(name);
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


function isDevHost() {
  const hostname = getLocationOrNull()?.hostname;
  return ["localhost", "127.0.0.1"].includes(hostname || "");
}

export function renderCreatureIdle(container, { classKey, size = "md", alt } = {}) {
  if (!container) return;
  const label = classKey || "unknown";
  const resolvedSize = resolveAvatarSize(size);

  const img = document.createElement("img");
  img.width = resolvedSize;
  img.height = resolvedSize;
  img.className = "creature-idle";

  const showFallback = () => {
    container.innerHTML = "";
    container.appendChild(createCreatureFallback(resolvedSize, alt || `${label} missing GIF`));
  };

  img.onerror = () => {
    if (isDevHost()) {
      console.warn("[renderCreatureIdle] failed to load idle image", {
        creatureId: label,
        attemptedSrc: img.currentSrc || img.src,
      });
    }
    showFallback();
  };

  img.alt = alt || `${label} idle creature`;
  loadImageWithFallback(img, getHomepageCreatureIdleCandidates(label), {
    creatureId: label,
    animationName: 'idle_choose',
    logPrefix: '[renderCreatureIdle]',
  });
  container.innerHTML = "";
  container.appendChild(img);
}

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
  showPlayerId = Boolean(getWindowOrNull()?.__FF_DEBUG_SHOW_PLAYER_ID__),
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



export function getPlayerCreatureSummary({
  playerId,
  creatureId = null,
  creatureNickname = null,
} = {}) {
  const resolvedCreatureId = creatureId || getPlayerCreatureId(playerId) || null;
  const resolvedNickname = normalizeNickname(creatureNickname) || normalizeNickname(getPlayerCreatureNickname(playerId));
  const presentation = getCreaturePresentation(playerId, resolvedCreatureId, resolvedNickname);
  return {
    playerId,
    creatureId: resolvedCreatureId,
    creatureNickname: resolvedNickname,
    creature: presentation.creature,
    creatureName: presentation.creatureName,
    primaryLabel: presentation.primaryLabel,
  };
}

export function getMatchOpponentSummary(match, currentPlayerId) {
  const iAmA = match?.playerAId === currentPlayerId;
  const opponentPlayerId = iAmA ? match?.playerBId : match?.playerAId;
  const opponentCreatureId = iAmA ? match?.playerBCreatureId : match?.playerACreatureId;
  const opponentCreatureNickname = normalizeNickname(iAmA ? match?.playerBNickname : match?.playerANickname);
  const presentation = getCreaturePresentation(opponentPlayerId, opponentCreatureId, opponentCreatureNickname);
  return {
    opponentPlayerId,
    opponentCreatureId: opponentCreatureId ?? null,
    opponentCreatureNickname,
    opponentCreatureName: presentation.creatureName,
    opponentPrimaryLabel: presentation.primaryLabel,
  };
}

export function getMatchOutcomeLabel(match, currentPlayerId) {
  if (!match) return "Draw";
  if (match.winner === "DRAW") return "Draw";
  const iAmA = match.playerAId === currentPlayerId;
  const won = (match.winner === "A" && iAmA) || (match.winner === "B" && !iAmA);
  return won ? "Victory" : "Defeat";
}

export function renderPlayerIdentity(container, options) {
  if (!container) return;
  container.replaceChildren(createPlayerIdentity(options));
}
