import type { SummaryV1 } from "../../core/sim/simulate.ts";
import { buildShareText } from "./shareText.ts";

type ReplayPageParams = {
  publicId: string;
  replayData: { summary: SummaryV1; matchHash: string; seedHex: string };
  baseUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderReplayPage(params: ReplayPageParams): string {
  const { publicId, replayData, baseUrl } = params;
  const { summary, matchHash } = replayData;
  const matchup = `${summary.a.classKey} vs ${summary.b.classKey}`;
  const winner = summary.winner === "DRAW" ? "DRAW" : `${summary.winner} (${summary.winner === "A" ? summary.a.classKey : summary.b.classKey})`;
  const hashPrefix = matchHash.slice(0, 10);
  const shareText = buildShareText(summary, publicId, baseUrl);
  const description = `${shareText.split("\n")[0]} • Hash ${hashPrefix}`;
  const ogImage = `${baseUrl}/og/${encodeURIComponent(publicId)}`;
  const replayJson = `/api/replay/${encodeURIComponent(publicId)}`;
  const shareApi = `/api/replay/${encodeURIComponent(publicId)}/share`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fart And Furious — Replay</title>
  <meta property="og:title" content="${escapeHtml(`Fart And Furious — ${matchup}`)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:image:type" content="image/svg+xml" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: Arial, sans-serif; background: #111827; color: #f9fafb; }
    main { max-width: 760px; margin: 2rem auto; padding: 1.2rem; background: #1f2937; border-radius: 12px; }
    h1 { margin-top: 0; }
    .row { margin: 0.35rem 0; }
    code { background: #0f172a; padding: 0.15rem 0.35rem; border-radius: 4px; }
    a { color: #93c5fd; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(matchup)}</h1>
    <p class="row"><strong>Winner:</strong> ${escapeHtml(winner)}</p>
    <p class="row"><strong>Turns:</strong> ${summary.turns}</p>
    <p class="row"><strong>Max Hit:</strong> ${summary.highlights.maxHitValue} by ${summary.highlights.maxHitBy}</p>
    <p class="row"><strong>Cataclysms:</strong> A ${summary.highlights.cataclysms.A} / B ${summary.highlights.cataclysms.B}</p>
    <p class="row"><strong>Backfires:</strong> A ${summary.a.backfires} / B ${summary.b.backfires}</p>
    <p class="row"><strong>Match Hash:</strong> <code>${escapeHtml(matchHash)}</code></p>
    <p class="row"><a href="${replayJson}">View JSON replay</a></p>
    <p class="row">Share hint: send a POST request to <code>${shareApi}</code> with JSON body <code>{"playerId":"..."}</code>.</p>
    <p class="row"><button id="copyShareText">Copy Share Text</button></p>
  </main>
  <script>
    const shareText = ${JSON.stringify(shareText)};
    document.getElementById('copyShareText')?.addEventListener('click', async () => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      }
    });
  </script>
</body>
</html>`;
}
