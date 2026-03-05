import { clearPlayerCreatureId, createChallenge, getGasRankTitle, getMatch, getPlayerCreatureId, randomSeed, setPlayerCreatureId } from "/app.js";
import { CREATURES, getCreatureById } from "/creatures.js";

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

function createCreatureSelectTile(creature, selectedId, onSelect) {
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
  img.width = 220;
  img.height = 220;
  img.loading = "lazy";
  img.onerror = () => {
    if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      console.warn("[profile] failed to load idle image", {
        creatureId: creature.id,
        attemptedSrc: img.currentSrc || img.src,
      });
    }
    imageWrap.innerHTML = `<div class="missing-gif" aria-label="Missing GIF">Missing GIF</div>`;
  };
  imageWrap.appendChild(img);

  const title = document.createElement("h3");
  title.textContent = creature.name;

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

  const activate = () => onSelect(creature.id);
  tile.onclick = activate;
  tile.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  };

  tile.append(imageWrap, title, blurb, overlay, badge);
  return tile;
}

function renderCreatureSelect(container, playerId, onContinue) {
  let selectedId = getPlayerCreatureId(playerId);

  const section = document.createElement("section");
  section.className = "card creature-select-card";

  const header = document.createElement("h2");
  header.textContent = "Creature Select";

  const grid = document.createElement("div");
  grid.className = "creature-select-grid";

  const continueBtn = document.createElement("button");
  continueBtn.textContent = "Continue";
  continueBtn.disabled = !selectedId;

  const rerender = () => {
    grid.innerHTML = "";
    for (const creature of CREATURES) {
      grid.appendChild(
        createCreatureSelectTile(creature, selectedId, (nextId) => {
          selectedId = nextId;
          continueBtn.disabled = false;
          rerender();
        }),
      );
    }
  };

  continueBtn.onclick = () => {
    if (!selectedId) return;
    setPlayerCreatureId(playerId, selectedId);
    onContinue(selectedId);
  };

  rerender();
  section.append(header, grid, continueBtn);
  container.replaceChildren(section);
}

function hideRedundantNav() {
  const newChallengeNav = document.getElementById("navNewChallenge");
  if (newChallengeNav) newChallengeNav.hidden = true;
}

function showSelectedCreatureLine(playerId, creatureId) {
  const line = document.getElementById("selectedCreatureLine");
  const creature = creatureId ? getCreatureById(creatureId) : null;
  line.textContent = creature ? `Creature: ${creature.name}` : "Creature: not selected";

  const button = document.getElementById("changeCreatureBtn");
  button.onclick = (event) => {
    event.preventDefault();
    clearPlayerCreatureId(playerId);
    document.getElementById("profileContent").hidden = true;
    initPlayerProfilePage(playerId);
  };
}

function toRecentMatchRows(recentMatches) {
  if (!recentMatches?.length) {
    return '<li>No finished matches yet.</li>';
  }
  return recentMatches
    .map((m) => `<li><a href="/replay/${m.publicId}">${m.publicId}</a> · Winner ${m.winner} · MaxHit ${m.maxHit}</li>`)
    .join("");
}

function firstItem(items) {
  return Array.isArray(items) && items.length ? items[0] : null;
}

function createDefaultCreatureSpec(creatureId) {
  const classKey = creatureId ?? "goblin";
  return { classKey, cosmeticSeed: randomSeed() };
}

async function resolveHomeState(playerId, creatureId) {
  const [publicData, mineOpen, mineAccepted, incoming] = await Promise.all([
    api(`/api/players/${encodeURIComponent(playerId)}/public`),
    api(`/api/challenges/mine?playerId=${encodeURIComponent(playerId)}&status=open&limit=20`),
    api(`/api/challenges/mine?playerId=${encodeURIComponent(playerId)}&status=accepted&limit=20`),
    api(`/api/challenges/open?excludePlayerId=${encodeURIComponent(playerId)}&limit=20`),
  ]);

  const myOpenChallenge = (mineOpen.items ?? []).find((item) => item.playerAId === playerId) ?? null;
  if (myOpenChallenge) {
    return {
      kind: "waiting",
      ctaLabel: "New challenge",
      statusText: "Waiting for opponent…",
      shareUrl: `${location.origin}/c/${myOpenChallenge.token}`,
      onClick: async () => {
        await createChallenge(playerId, createDefaultCreatureSpec(creatureId), creatureId);
        await refreshPlayerHome(playerId, creatureId);
      },
      recentMatches: publicData.recentMatches,
      wins: publicData.profile?.wins ?? 0,
    };
  }

  const incomingChallenge = firstItem(incoming.items);
  if (incomingChallenge) {
    return {
      kind: "incoming",
      ctaLabel: "Accept challenge",
      statusText: `Incoming challenge from ${incomingChallenge.playerAId ?? "another player"}.`,
      shareUrl: null,
      onClick: () => {
        location.href = `/c/${incomingChallenge.token}`;
      },
      recentMatches: publicData.recentMatches,
      wins: publicData.profile?.wins ?? 0,
    };
  }

  const acceptedChallenge = firstItem(mineAccepted.items);
  if (acceptedChallenge?.token) {
    const details = await api(`/api/challenges/${encodeURIComponent(acceptedChallenge.token)}?viewerId=${encodeURIComponent(playerId)}`);
    if (details.matchId) {
      const match = await getMatch(details.matchId);
      if (match.status === "collecting_moves") {
        const side = details.playerAId === playerId ? "A" : "B";
        return {
          kind: "active",
          ctaLabel: "Submit moves",
          statusText: "Match in progress.",
          shareUrl: null,
          onClick: () => {
            location.href = `/m/${encodeURIComponent(details.matchId)}?side=${side}`;
          },
          recentMatches: publicData.recentMatches,
          wins: publicData.profile?.wins ?? 0,
        };
      }
      if (match.status === "finished") {
        const publicId = details.publicId || match.publicId;
        if (publicId) {
          return {
          kind: "finished",
          ctaLabel: "Rematch",
          statusText: "Last match finished.",
          shareUrl: null,
          onClick: () => {
            location.href = `/replay/${encodeURIComponent(publicId)}`;
          },
          recentMatches: publicData.recentMatches,
          wins: publicData.profile?.wins ?? 0,
        };
        }
      }
    }
  }

  return {
    kind: "idle",
    ctaLabel: "New challenge",
    statusText: "Ready to start a new match.",
    shareUrl: null,
    onClick: async () => {
      await createChallenge(playerId, createDefaultCreatureSpec(creatureId), creatureId);
      await refreshPlayerHome(playerId, creatureId);
    },
    recentMatches: publicData.recentMatches,
    wins: publicData.profile?.wins ?? 0,
  };
}

async function refreshPlayerHome(playerId, creatureId) {
  const statusEl = document.getElementById("homeStatus");
  const errorEl = document.getElementById("homeError");
  const primaryBtn = document.getElementById("primaryActionBtn");
  const shareLink = document.getElementById("shareChallengeLink");

  statusEl.textContent = "Loading profile…";
  errorEl.textContent = "";
  primaryBtn.disabled = true;

  try {
    const state = await resolveHomeState(playerId, creatureId);
    const rankTitle = getGasRankTitle(state.wins);
    const playerName = document.getElementById("player");
    playerName.textContent = playerId;

    const rank = document.querySelector(".gas-rank-badge");
    if (rank) rank.remove();
    playerName.insertAdjacentHTML("afterend", `<div class="gas-rank-badge${rankTitle.includes("👑") ? " top-tier" : ""}">${rankTitle}</div>`);

    primaryBtn.textContent = state.ctaLabel;
    primaryBtn.disabled = false;
    primaryBtn.onclick = () => void state.onClick();

    statusEl.textContent = state.statusText;
    shareLink.hidden = !state.shareUrl;
    if (state.shareUrl) {
      shareLink.href = state.shareUrl;
      shareLink.textContent = "Share link";
    }

    document.getElementById("recent").innerHTML = toRecentMatchRows(state.recentMatches);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusEl.textContent = "Could not load home state.";
    errorEl.textContent = message;
    primaryBtn.disabled = true;
  }
}

export async function initPlayerProfilePage(playerId) {
  hideRedundantNav();
  const flow = document.getElementById("creatureFlow");
  const profileContent = document.getElementById("profileContent");
  const selected = getPlayerCreatureId(playerId);

  if (!selected) {
    profileContent.hidden = true;
    renderCreatureSelect(flow, playerId, async (creatureId) => {
      showSelectedCreatureLine(playerId, creatureId);
      flow.replaceChildren();
      profileContent.hidden = false;
      await refreshPlayerHome(playerId, creatureId);
    });
    return;
  }

  showSelectedCreatureLine(playerId, selected);
  flow.replaceChildren();
  profileContent.hidden = false;
  await refreshPlayerHome(playerId, selected);
}

export async function apiLeaderboardGlobal() {
  const data = await api("/api/leaderboard/global");
  document.getElementById("rows").innerHTML = data.rows
    .map((r, i) => {
      const rankTitle = getGasRankTitle(r.wins ?? 0);
      const badgeClass = rankTitle.includes("👑") ? "gas-rank-badge top-tier" : "gas-rank-badge";
      return `<tr><td>${i + 1}</td><td><a href="/p/${encodeURIComponent(r.playerId)}">${r.playerId}</a><div class="${badgeClass}">${rankTitle}</div></td><td>${r.stinkFame}</td><td>${r.wins}</td><td>${r.maxHitEver}</td></tr>`;
    })
    .join("");
}

export async function apiRivalry(playerA, playerB) {
  const data = await api(`/api/rivalry/${encodeURIComponent(playerA)}/${encodeURIComponent(playerB)}`);
  document.getElementById("stats").textContent = `Matches ${data.totalMatches} · ${playerA} W${data.winsA} · ${playerB} W${data.winsB} · Damage ${data.totalDamageA}/${data.totalDamageB}`;
  document.getElementById("matches").innerHTML = data.matches.map((publicId) => `<li><a href="/replay/${publicId}">${publicId}</a></li>`).join("");
}

export async function apiDaily() {
  const data = await api("/api/daily-highlight");
  document.getElementById("daily").innerHTML = `${data.highlightType} by <a href="/p/${encodeURIComponent(data.playerId)}">${data.playerId}</a> (value ${data.value}) · <a href="/replay/${data.publicId}">Watch replay</a>`;
}
