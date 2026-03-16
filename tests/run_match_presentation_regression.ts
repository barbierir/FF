import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const replayHtml = fs.readFileSync(path.resolve(process.cwd(), 'public/replay.html'), 'utf8');
const matchPresentationJs = fs.readFileSync(path.resolve(process.cwd(), 'public/matchPresentation.js'), 'utf8');
const presentationAssetsJs = fs.readFileSync(path.resolve(process.cwd(), 'public/presentationAssets.js'), 'utf8');

assert.match(presentationAssetsJs, /export const animationPlaybackMeta = Object\.freeze\(/, 'expected centralized animation playback metadata');
assert.match(presentationAssetsJs, /defeat:\s*Object\.freeze\(\{\s*shouldLoop:\s*false/, 'defeat should be marked non-looping in metadata');
assert.match(matchPresentationJs, /enterFinalMatchState\(winner\)/, 'expected shared final-state helper');
assert.match(matchPresentationJs, /this\.showResult\(\)/, 'expected result entrypoint to exist');
assert.match(matchPresentationJs, /this\.enterFinalMatchState\(winner\);/, 'showResult should route through shared final-state helper');
assert.match(matchPresentationJs, /this\.clearTimers\(\);\n\s*this\.clearTransientAnimationTimers\(\);/, 'enterFinalMatchState should cancel transient and scheduled timers');
assert.match(matchPresentationJs, /this\.setTransientAnimation\(actor, 'charge', atMs \+ ACTION_START_MS\);/, 'charge should remain active until action starts');
assert.match(matchPresentationJs, /this\.setTransientAnimation\(actor, actionAnim, atMs \+ ACTION_HOLD_MS\);/, 'attack/backfire should remain visible through the action window');
assert.match(matchPresentationJs, /if \(this\.canReturnToIdle\('A', nowMs\)\) this\.setCreatureAnimation\('A', 'idle'\);/, 'idle fallback should respect transient priority for side A');
assert.match(matchPresentationJs, /if \(this\.finalStateLock\) return;\n\s*this\.setTransientAnimation\(defender, 'hit'/, 'transient hit callback should be blocked after final state lock');
assert.match(matchPresentationJs, /this\.setCreatureAnimation\('A', 'victory', \{ force: true \}\);\n\s*this\.setCreatureAnimation\('B', 'victory', \{ force: true \}\);/, 'draw should no longer drop to idle in final state');
assert.match(replayHtml, /data-creature-label="A"/, 'left creature name label missing');
assert.match(replayHtml, /data-creature-label="B"/, 'right creature name label missing');
assert.match(replayHtml, /function renderBattleCreatureLabels\(\)/, 'expected battle creature label renderer');
assert.match(replayHtml, /data\.match\?\.playerANickname/, 'expected match-relative nickname source for side A');
assert.match(replayHtml, /data\.match\?\.playerBNickname/, 'expected match-relative nickname source for side B');

console.log('match presentation regression checks passed');
