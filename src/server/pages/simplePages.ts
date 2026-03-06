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
<div class="topbar"><strong>Fart And Furious</strong><nav class="nav-links" aria-label="Primary"><a data-nav="home" href="/home">Home</a><a data-nav="profile" id="myProfileLink" href="/">My Profile</a><a data-nav="leaderboard" href="/leaderboard">Leaderboard</a><a data-nav="daily" id="navDaily" href="/daily">Daily Challenge</a></nav><a id="navNewChallenge" href="/?new=1" class="small-link topbar-utility-link">New Challenge</a></div>
<main class="page-stack">${body}</main>
<script type="module">
import { updateTopNav } from '/app.js';
updateTopNav();
</script>
</body></html>`;
}

export function renderProfileShell(playerId: string): string {
  return layout(
    "Fart And Furious — My Profile",
    "My Profile",
    "Track player stats, recent matches, and rivalries.",
    `<section class="card module-primary"><h1>My Farting Champion</h1><div id="creatureFlow"></div><div id="profileContent" hidden><div class="player-home-header"><div id="profileIdentity"></div><a id="changeCreatureBtn" class="small-link" href="#">Change Creature</a></div><div class="profile-stats-row"><span>Wins: <strong id="profileWins">0</strong></span><span>Losses: <strong id="profileLosses">0</strong></span><span>Draws: <strong id="profileDraws">0</strong></span><span>Rank: <strong id="profileRank">—</strong></span></div><button id="primaryActionBtn" type="button">New Challenge</button><p id="homeStatus" class="small"></p><p id="homeError" class="error"></p><div class="player-home-links"><a href="#matchHistory">Recent Matches</a></div><section id="shareChallengeActions" class="challenge-share" hidden></section><p id="shareFeedback" class="small"></p><h2 id="matchHistory">Recent Matches</h2><ul id="recent" class="data-list"></ul></div></section>
<script type="module">
import { initPlayerProfilePage } from '/profile.js';
initPlayerProfilePage(${JSON.stringify(playerId)});
</script>`,
  );
}

export function renderLeaderboardShell(): string {
  return layout(
    "Fart And Furious — Leaderboard",
    "Top Fart And Furious Players",
    "Global top 50 by StinkFame.",
    `<section class="card module-primary"><h1 class="chaos-glow">Leaderboard</h1><p id="leaderboardEmpty" class="small" hidden>No completed matches yet.</p><table><thead><tr><th>#</th><th>Identity</th><th>Creature</th><th>Wins</th><th>Losses</th><th>Draws</th><th>Played</th></tr></thead><tbody id="rows"></tbody></table></section>
<script type="module">
import { apiLeaderboardGlobal } from '/profile.js';
apiLeaderboardGlobal();
</script>`,
  );
}

export function renderRivalryShell(playerA: string, playerB: string): string {
  return layout(
    "Rivalry",
    "Rivalry matchup",
    "Head-to-head stats and replays.",
    `<section class="card module-primary"><h1>Rivalry</h1><p id="stats"></p><ul id="matches" class="data-list"></ul></section>
<script type="module">
import { apiRivalry } from '/profile.js';
apiRivalry(${JSON.stringify(playerA)}, ${JSON.stringify(playerB)});
</script>`,
  );
}

export function renderDailyShell(): string {
  return layout(
    "Fart And Furious — Daily Challenge",
    "Daily Challenge",
    "Daily challenge highlight from today's finished matches.",
    `<section class="card module-primary"><h1>Daily Challenge</h1><p id="daily"></p></section>
<script type="module">
import { apiDaily } from '/profile.js';
apiDaily();
</script>`,
  );
}
