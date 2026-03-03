import { getGasRankTitle } from "/app.js";

async function api(path) {
  const res = await fetch(path);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

export async function apiPlayerPublic(playerId) {
  const data = await api(`/api/players/${encodeURIComponent(playerId)}/public`);
  const rankTitle = getGasRankTitle(data.profile.wins ?? 0);
  const playerName = document.getElementById("player");
  if (playerName) {
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
