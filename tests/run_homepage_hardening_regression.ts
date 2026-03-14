import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const appJs = fs.readFileSync(path.resolve(root, 'public/app.js'), 'utf8');
const audioManagerJs = fs.readFileSync(path.resolve(root, 'public/audioManager.js'), 'utf8');
const homeHtml = fs.readFileSync(path.resolve(root, 'public/home.html'), 'utf8');

assert.match(appJs, /function readLocalStorage\(key\)\s*\{[\s\S]*?try \{[\s\S]*?localStorage[\s\S]*?\} catch \(error\)/, 'app.js must guard localStorage reads');
assert.match(appJs, /function removeSessionStorage\(key\)/, 'app.js must guard sessionStorage access');
assert.match(appJs, /function getForceNewModeFlag\(\)/, 'app.js should lazily compute force-new mode instead of top-level window mutation');

assert.match(audioManagerJs, /const musicPlayers = \{\s*game: null,\s*match: null,\s*\};/, 'audioManager.js should avoid top-level Audio creation');
assert.match(audioManagerJs, /function bootstrapAudioIfNeeded\(\)/, 'audioManager.js should initialize browser audio lazily');
assert.match(audioManagerJs, /export function syncMusicForCurrentPage\(pathname\)/, 'audioManager.js sync should not require window at function definition time');

assert.match(homeHtml, /renderPlayerIdentity\([\s\S]*?\);[\s\S]*?await Promise\.allSettled\(/, 'home.html must render identity before non-critical async data loads complete');
assert.doesNotMatch(homeHtml, /AUDIO_INIT_ERROR/, 'home.html logs should avoid noisy mis-labeled audio init errors for profile loading');

console.log('homepage hardening regression checks passed');
