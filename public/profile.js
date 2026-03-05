import { getGasRankTitle } from "/app.js";
import { CREATURES, getCreatureById } from "/creatures.js";
import { clearPlayerCreatureId, getPlayerCreatureId, setPlayerCreatureId } from "/playerCreature.js";

async function api(path) {
  const res = await fetch(path);
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
  img.src = `/creatures/idle/${creature.id}.gif`;
  img.alt = `${creature.name} idle`;
  img.width = 220;
  img.height = 220;
  img.loading = "lazy";
  img.onerror = () => {
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

export async function apiPlayerPublic(playerId) {
  const res = await fetch(`/api/players/${encodeURIComponent(playerId)}/public`);
  if (!res.ok) {
    throw new Error(`Profile fetch failed: ${res.status}`);
  }
  const data = await res.json();
  const rankTitle = getGasRankTitle(data.profile.wins ?? 0);
  const playerName = document.getElementById("player");
  if (playerName && !document.querySelector(".gas-rank-badge")) {
    playerName.insertAdjacentHTML("afterend", `<div class="gas-rank-badge${rankTitle.includes("👑") ? " top-tier" : ""}">${rankTitle}</div>`);
  }
  const stats = Object.entries(data.profile).map(([k, v]) => `<div><strong>${k}</strong><div>${v}</div></div>`).join("");
  document.getElementById("profile").innerHTML = `<div class="grid">${stats}</div>`;
  document.getElementById("maxHit").textContent = String(data.profile.maxHitEver);
  document.getElementById("recent").innerHTML = data.recentMatches
    .map((m) => `<li><a href="/replay/${m.publicId}">${m.publicId}</a> · Winner ${m.winner} · MaxHit ${m.maxHit}</li>`)
    .join("");
  document.getElementById("rivals").innerHTML = data.rivalries
    .map((r) => `<li><a href="/rivalry/${encodeURIComponent(playerId)}-vs-${encodeURIComponent(r.opponentId)}">${r.opponentId}</a> · Matches ${r.totalMatches} · W${r.wins}/L${r.losses}</li>`)
    .join("");
}

function ensureProfileStatus() {
  const profileContent = document.getElementById("profileContent");
  let status = document.getElementById("profileStatus");
  if (!status) {
    status = document.createElement("p");
    status.id = "profileStatus";
    status.className = "small";
    profileContent.insertAdjacentElement("beforebegin", status);
  }
  return status;
}

async function loadPlayerProfile(playerId, { onRetry } = {}) {
  const status = ensureProfileStatus();
  status.textContent = "Loading profile…";
  status.classList.remove("error");
  status.replaceChildren(document.createTextNode("Loading profile…"));
  console.debug(`[profile-page] load start playerId=${playerId}`);
  try {
    await apiPlayerPublic(playerId);
    status.textContent = "";
    console.debug(`[profile-page] load success playerId=${playerId}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.debug(`[profile-page] load fail playerId=${playerId}`, error);
    status.classList.add("error");
    status.replaceChildren();
    const text = document.createElement("span");
    text.textContent = `Failed to load profile (${message}).`;
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "secondary";
    retryBtn.textContent = "Retry";
    retryBtn.style.marginLeft = "8px";
    retryBtn.onclick = () => {
      onRetry?.();
    };
    status.append(text, retryBtn);
    return false;
  } finally {
    console.debug(`[profile-page] load finalize playerId=${playerId} loading=false`);
  }
}

function showSelectedCreatureLine(playerId, creatureId) {
  const line = document.getElementById("selectedCreatureLine");
  const creature = creatureId ? getCreatureById(creatureId) : null;
  line.textContent = creature ? `Creature: ${creature.name}` : `Creature: not selected`;

  const button = document.getElementById("changeCreatureBtn");
  button.onclick = () => {
    clearPlayerCreatureId(playerId);
    document.getElementById("profileContent").hidden = true;
    initPlayerProfilePage(playerId);
  };
}

export async function initPlayerProfilePage(playerId) {
  const flow = document.getElementById("creatureFlow");
  const profileContent = document.getElementById("profileContent");
  const selected = getPlayerCreatureId(playerId);

  if (!selected) {
    profileContent.hidden = true;
    renderCreatureSelect(flow, playerId, async (creatureId) => {
      showSelectedCreatureLine(playerId, creatureId);
      flow.replaceChildren();
      profileContent.hidden = false;
      await loadPlayerProfile(playerId, { onRetry: () => void initPlayerProfilePage(playerId) });
    });
    return;
  }

  showSelectedCreatureLine(playerId, selected);
  flow.replaceChildren();
  profileContent.hidden = false;
  await loadPlayerProfile(playerId, { onRetry: () => void initPlayerProfilePage(playerId) });
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
