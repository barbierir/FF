function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function layout(title: string, ogTitle: string, ogDescription: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(ogTitle)}" />
<meta property="og:description" content="${escapeHtml(ogDescription)}" />
<meta property="og:type" content="website" />
<link rel="stylesheet" href="/styles.css" />
</head><body>
<div class="topbar"><strong>Fart And Furious</strong><nav class="nav-links"><a href="/home">Home</a><a href="/">New Challenge</a><a href="/leaderboard">Leaderboard</a><a id="myProfileLink" href="/">My Profile</a></nav></div>
<main>${body}</main>
<script type="module">
import { updateTopNav } from '/app.js';
updateTopNav();
</script>
</body></html>`;
}

export function renderProfileShell(playerId: string): string {
  return layout(
    `Fart And Furious — ${playerId}`,
    `Player ${playerId}`,
    `Track ${playerId}'s stats, recent matches, and rivalries.`,
    `<section class="card"><h1 id="player">${escapeHtml(playerId)}</h1><div id="profile"></div><h2>Most Explosive Hit Ever</h2><p id="maxHit"></p><h2>Recent Matches</h2><ul id="recent"></ul><h2>Rivalries</h2><ul id="rivals"></ul></section>
<script type="module">
import { apiPlayerPublic } from '/profile.js';
apiPlayerPublic(${JSON.stringify(playerId)});
</script>`,
  );
}

export function renderLeaderboardShell(): string {
  return layout(
    "Fart And Furious — Leaderboard",
    "Top Fart And Furious Players",
    "Global top 50 by StinkFame.",
    `<section class="card"><h1>Global Leaderboard</h1><table><thead><tr><th>#</th><th>Player</th><th>StinkFame</th><th>Wins</th><th>Max Hit</th></tr></thead><tbody id="rows"></tbody></table></section>
<script type="module">
import { apiLeaderboardGlobal } from '/profile.js';
apiLeaderboardGlobal();
</script>`,
  );
}

export function renderRivalryShell(playerA: string, playerB: string): string {
  return layout(
    `Rivalry ${playerA} vs ${playerB}`,
    `Rivalry: ${playerA} vs ${playerB}`,
    "Head-to-head stats and replays.",
    `<section class="card"><h1>${escapeHtml(playerA)} vs ${escapeHtml(playerB)}</h1><p id="stats"></p><ul id="matches"></ul></section>
<script type="module">
import { apiRivalry } from '/profile.js';
apiRivalry(${JSON.stringify(playerA)}, ${JSON.stringify(playerB)});
</script>`,
  );
}

export function renderDailyShell(): string {
  return layout(
    "Fart And Furious — Daily Highlight",
    "Today's Most Explosive Creature",
    "Daily viral highlight from today's finished matches.",
    `<section class="card"><h1>Today's Most Explosive Creature</h1><p id="daily"></p></section>
<script type="module">
import { apiDaily } from '/profile.js';
apiDaily();
</script>`,
  );
}
