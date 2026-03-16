import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const replayHtml = fs.readFileSync(path.resolve(process.cwd(), 'public/replay.html'), 'utf8');
const matchPresentationJs = fs.readFileSync(path.resolve(process.cwd(), 'public/matchPresentation.js'), 'utf8');
const presentationAssetsJs = fs.readFileSync(path.resolve(process.cwd(), 'public/presentationAssets.js'), 'utf8');
const creatureAnimationsJs = fs.readFileSync(path.resolve(process.cwd(), 'public/creatureAnimations.js'), 'utf8');

assert.match(presentationAssetsJs, /export const animationPlaybackMeta = Object\.freeze\(/, 'expected centralized animation playback metadata');
assert.match(presentationAssetsJs, /defeat:\s*Object\.freeze\(\{\s*shouldLoop:\s*false/, 'defeat should be marked non-looping in metadata');
assert.match(matchPresentationJs, /enterFinalMatchState\(winner\)/, 'expected shared final-state helper');
assert.match(matchPresentationJs, /this\.showResult\(\)/, 'expected result entrypoint to exist');
assert.match(matchPresentationJs, /this\.enterFinalMatchState\(winner\);/, 'showResult should route through shared final-state helper');
assert.match(matchPresentationJs, /this\.clearTransientTimers\(\);\n\s*this\.clearTransientAnimationTimers\(\);/, 'enterFinalMatchState should cancel only transient timers');
assert.match(matchPresentationJs, /this\.setTransientAnimation\(actor, 'charge', atMs \+ ACTION_START_MS\);/, 'charge should remain active until action starts');
assert.match(matchPresentationJs, /this\.setTransientAnimation\(actor, actionAnim, atMs \+ ACTION_HOLD_MS\);/, 'attack\/backfire should remain visible through the action window');
assert.match(matchPresentationJs, /if \(this\.canReturnToIdle\('A', nowMs\)\) this\.setCreatureAnimation\('A', 'idle'\);/, 'idle fallback should respect transient priority for side A');
assert.match(matchPresentationJs, /if \(this\.finalStateLock\) return;\n\s*this\.setTransientAnimation\(defender, 'hit'/, 'transient hit callback should be blocked after final state lock');
assert.match(matchPresentationJs, /this\.setCreatureAnimation\('A', 'idle', \{ force: true \}\);\n\s*this\.setCreatureAnimation\('B', 'idle', \{ force: true \}\);/, 'draw should show idle on both sides in final state');
assert.match(matchPresentationJs, /if \(this\.completed\) return;/, 'complete should be idempotent');
assert.match(matchPresentationJs, /this\.scheduleAt\(step\.atMs, 0, \(\) => \{[\s\S]*step\.phase === 'finished' \? 'completion' : 'transient'\);/, 'finished step should use completion timer group');
assert.match(matchPresentationJs, /mountBubbleEvent\(event\) \{[\s\S]*const bubble = bubbleAnchor\.cloneNode\(false\);[\s\S]*bubbleAnchor\.replaceWith\(bubble\);/, 'bubble should remount DOM node for every event so repeated captions restart cleanly');
assert.match(matchPresentationJs, /const BUBBLE_VISIBLE_MS = 1_000;/, 'bubble visibility window should be explicit and consistent');
assert.match(matchPresentationJs, /createBubbleEvent\(payload\) \{[\s\S]*id: `\$\{baseEventId\}_\$\{\+\+this\.bubbleEventSequence\}`,[\s\S]*durationMs:/, 'bubble rendering should create a unique event object for each display cycle');
assert.match(matchPresentationJs, /this\.activeBubbleEvent = bubbleEvent;[\s\S]*if \(this\.activeBubbleEvent\?\.id !== bubbleEvent\.id\) return;/, 'bubble lifecycle should be keyed by active bubble event identity');
assert.match(matchPresentationJs, /this\.clearBubbleTimer\(\);[\s\S]*this\.bubbleHideTimer = setTimeout\(/, 'bubble timers should be reset on every new event');
assert.match(matchPresentationJs, /slot\.dataset\.animation = 'defeat_locked';[\s\S]*getDefeatFrozenAssetCandidates/, 'defeat should transition into locked post-defeat frame after one-shot playback');
assert.match(matchPresentationJs, /const candidates = actionType === 'defeat'\s*\n\s*\? animationCandidates/, 'defeat animation should not use idle fallback candidates');
assert.match(matchPresentationJs, /setTimeout\(\(\) => this\.freezeDefeated\('B'\), freezeAfter\)/, 'side B defeat lock should be scheduled from explicit duration metadata');
assert.match(matchPresentationJs, /setTimeout\(\(\) => this\.freezeDefeated\('A'\), freezeAfter\)/, 'side A defeat lock should be scheduled from explicit duration metadata');
assert.match(creatureAnimationsJs, /`\/creatures\/\$\{normalizedCreatureId\}\/defeat_final\.png`/, 'defeat frozen candidates should prioritize defeat_final.png');
assert.match(replayHtml, /data-creature-label="A"/, 'left creature name label missing');
assert.match(replayHtml, /data-creature-label="B"/, 'right creature name label missing');
assert.match(replayHtml, /function renderBattleCreatureLabels\(\)/, 'expected battle creature label renderer');
assert.match(replayHtml, /data\.match\?\.playerANickname/, 'expected match-relative nickname source for side A');
assert.match(replayHtml, /data\.match\?\.playerBNickname/, 'expected match-relative nickname source for side B');

console.log('match presentation regression checks passed');
