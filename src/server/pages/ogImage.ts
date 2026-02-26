import type { SummaryV1 } from "../../core/sim/simulate.ts";

type OgReplayData = {
  publicId: string;
  summary: SummaryV1;
  matchHash: string;
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderOgSvg(replayData: OgReplayData): string {
  const { publicId, summary, matchHash } = replayData;
  const matchup = `${summary.a.classKey} vs ${summary.b.classKey}`;
  const winnerLabel = summary.winner === "DRAW" ? "DRAW" : `${summary.winner} (${summary.winner === "A" ? summary.a.classKey : summary.b.classKey})`;
  const flags: string[] = [];
  if (summary.highlights.humiliationWin) flags.push("Humiliation");
  if (summary.highlights.clutchWin) flags.push("Clutch");
  const flagText = flags.length > 0 ? flags.join(" • ") : "No special flags";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Fart And Furious replay card">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="100%" stop-color="#2a1158"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="36" y="36" width="1128" height="558" rx="24" fill="#111827" stroke="#f59e0b" stroke-width="4" />
  <text x="70" y="105" fill="#fde68a" font-family="Arial, sans-serif" font-size="48" font-weight="700">Fart And Furious</text>
  <text x="70" y="145" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="26">Deterministic Gas Combat</text>

  <text x="70" y="255" fill="#ffffff" font-family="Arial, sans-serif" font-size="68" font-weight="700">${escapeXml(matchup)}</text>

  <rect x="70" y="290" width="470" height="64" rx="12" fill="#7c3aed" />
  <text x="92" y="334" fill="#ffffff" font-family="Arial, sans-serif" font-size="38" font-weight="700">WINNER: ${escapeXml(winnerLabel)}</text>

  <text x="70" y="412" fill="#a7f3d0" font-family="Arial, sans-serif" font-size="34">Max hit: ${summary.highlights.maxHitValue} by ${summary.highlights.maxHitBy}</text>
  <text x="70" y="460" fill="#a7f3d0" font-family="Arial, sans-serif" font-size="34">Cataclysms: A ${summary.highlights.cataclysms.A} / B ${summary.highlights.cataclysms.B}</text>
  <text x="70" y="508" fill="#a7f3d0" font-family="Arial, sans-serif" font-size="34">Flags: ${escapeXml(flagText)}</text>

  <text x="70" y="568" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="24">match: ${escapeXml(publicId)} • hash: ${escapeXml(matchHash.slice(0, 10))}</text>
</svg>`;
}
