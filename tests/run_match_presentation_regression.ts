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
assert.match(matchPresentationJs, /if \(this\.finalStateLock\) return;\n\s*this\.setCreatureAnimation\(defender, 'hit'/, 'transient hit callback should be blocked after final state lock');
assert.match(replayHtml, /data-creature-label="A"/, 'left creature name label missing');
assert.match(replayHtml, /data-creature-label="B"/, 'right creature name label missing');
assert.match(replayHtml, /function renderBattleCreatureLabels\(\)/, 'expected battle creature label renderer');
assert.match(replayHtml, /data\.match\?\.playerANickname/, 'expected match-relative nickname source for side A');
assert.match(replayHtml, /data\.match\?\.playerBNickname/, 'expected match-relative nickname source for side B');

console.log('match presentation regression checks passed');
