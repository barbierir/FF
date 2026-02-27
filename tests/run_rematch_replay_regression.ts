import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const replayHtml = fs.readFileSync(path.resolve(process.cwd(), "public/replay.html"), "utf8");

assert.match(
  replayHtml,
  /sideAButton\.addEventListener\('click',\s*\(\)\s*=>\s*pickSide\('A'\)\)/,
  "Picking side A must only set side selection state",
);

assert.match(
  replayHtml,
  /sideBButton\.addEventListener\('click',\s*\(\)\s*=>\s*pickSide\('B'\)\)/,
  "Picking side B must only set side selection state",
);

assert.match(
  replayHtml,
  /if\s*\(!sideAButton\s*\|\|\s*!sideBButton\s*\|\|\s*!cancelSidePickerButton\)\s*\{\s*\n\s*throw new Error\('side picker buttons missing from DOM'\);/,
  "Side picker wiring should fail fast if button elements are missing",
);

assert.match(
  replayHtml,
  /rematchBtn\.onclick\s*=\s*requestRematch/,
  "Rematch endpoint should be gated behind explicit Rematch button click",
);

const createRematchCalls = replayHtml.match(/createRematch\(/g) ?? [];
assert.equal(createRematchCalls.length, 1, "Replay page should call createRematch exactly once");

assert.match(
  replayHtml,
  /createRematch\(publicId,\s*viewerPlayerId,\s*resolvedSide\)/,
  "Rematch payload must use viewerPlayerId and resolvedSide",
);

assert.match(
  replayHtml,
  /if\s*\(rematchInFlight\)\s*return;/,
  "Rematch click handler must guard against duplicate in-flight submissions",
);

assert.match(
  replayHtml,
  /const\s+resolvedSide\s*=\s*getResolvedSide\(\);\s*\n\s*if\s*\(!resolvedSide\)\s*\{\s*\n\s*showSidePicker\(\);/,
  "Overlay should show only when side is unresolved",
);

const appJs = fs.readFileSync(path.resolve(process.cwd(), "public/app.js"), "utf8");
assert.match(
  appJs,
  /export\s+async\s+function\s+getViewerPlayerId\(\)\s*\{\s*\n\s*return\s+getOrCreateGuestPlayer\(\);\s*\n\}/,
  "Viewer identity must come from stable player storage helper",
);

console.log("replay rematch regression checks passed");
