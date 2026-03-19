export const MATCH_ANIMATION_NAMES = Object.freeze([
  'idle',
  'recharge',
  'attack',
  'backfire',
  'hit',
  'defeat',
  'victory',
]);

export const SELECTION_ANIMATION_NAMES = Object.freeze(['idle']);

export const ALL_ANIMATION_NAMES = Object.freeze([
  ...MATCH_ANIMATION_NAMES,
  ...SELECTION_ANIMATION_NAMES,
]);

const CREATURE_IDS = Object.freeze(['goblin', 'dragon', 'skunk', 'troll', 'fairy', 'demon']);
const SPRITE_COLUMNS = 4;
const SPRITE_ROWS = 4;

const ANIMATION_ALIASES = Object.freeze({
  charge: 'recharge',
  idle_choose: 'idle',
  defeat_locked: 'defeat',
});

const DEFAULT_ANIMATION_CONFIG = Object.freeze({
  idle: Object.freeze({ frames: 16, fps: 12, loop: true }),
  attack: Object.freeze({ frames: 16, fps: 10, loop: false }),
  hit: Object.freeze({ frames: 16, fps: 10, loop: false }),
  backfire: Object.freeze({ frames: 16, fps: 10, loop: false }),
  recharge: Object.freeze({ frames: 16, fps: 10, loop: false }),
  victory: Object.freeze({ frames: 16, fps: 12, loop: true }),
  defeat: Object.freeze({ frames: 16, fps: 10, loop: false, holdLastFrame: true }),
});

export const CREATURE_ANIMATIONS = Object.freeze(
  Object.fromEntries(
    CREATURE_IDS.map((creatureId) => [
      creatureId,
      Object.freeze({
        ...DEFAULT_ANIMATION_CONFIG,
        charge: DEFAULT_ANIMATION_CONFIG.recharge,
        idle_choose: DEFAULT_ANIMATION_CONFIG.idle,
        defeat_locked: DEFAULT_ANIMATION_CONFIG.defeat,
      }),
    ]),
  ),
);

function normalizeCreatureId(creatureId) {
  return CREATURE_IDS.includes(creatureId) ? creatureId : 'goblin';
}

function normalizeAnimationName(animationName) {
  const safeName = animationName || 'idle';
  return ANIMATION_ALIASES[safeName] || safeName;
}

function buildSpriteSheetPath(creatureId, animationName) {
  return `/assets/creatures/${creatureId}/${animationName}.png`;
}

export function getCreatureAnimationAssetCandidates(creatureId, animationName) {
  const safeCreatureId = normalizeCreatureId(creatureId);
  const safeAnimationName = normalizeAnimationName(animationName);
  const candidates = [
    buildSpriteSheetPath(safeCreatureId, safeAnimationName),
  ];
  if (safeAnimationName !== 'idle') {
    candidates.push(buildSpriteSheetPath(safeCreatureId, 'idle'));
  }
  return [...new Set(candidates)];
}

export function getCreatureAnimationConfig(creatureId, animationName) {
  const safeCreatureId = normalizeCreatureId(creatureId);
  const safeAnimationName = normalizeAnimationName(animationName);
  return CREATURE_ANIMATIONS[safeCreatureId][safeAnimationName] || CREATURE_ANIMATIONS[safeCreatureId].idle;
}

export function getCreatureSpriteDefinition(creatureId, animationName) {
  return {
    spriteSheetUrl: getCreatureAnimationAssetCandidates(creatureId, animationName)[0],
    animationConfig: getCreatureAnimationConfig(creatureId, animationName),
    columns: SPRITE_COLUMNS,
    rows: SPRITE_ROWS,
  };
}

export function getDefeatFrozenAssetCandidates(creatureId) {
  return getCreatureAnimationAssetCandidates(creatureId, 'defeat');
}

export function getCreatureAnimationAssetPath(creatureId, animationName) {
  return getCreatureAnimationAssetCandidates(creatureId, animationName)[0];
}

export function getCreatureMatchIdlePath(creatureId) {
  return getCreatureAnimationAssetPath(creatureId, 'idle');
}

export function getHomepageCreatureIdleCandidates(creatureId) {
  return getCreatureAnimationAssetCandidates(creatureId, 'idle');
}

export function getCreatureSelectionIdlePath(creatureId) {
  return getCreatureAnimationAssetPath(creatureId, 'idle');
}

export function generatePalette() {
  return {
    hue: Math.round((Math.random() * 60) - 30),
    saturation: Number((0.85 + Math.random() * 0.3).toFixed(3)),
    brightness: Number((0.9 + Math.random() * 0.2).toFixed(3)),
  };
}

export function loadImageWithFallback(img, candidates, context = {}) {
  if (!img) return;
  const queue = Array.isArray(candidates) ? [...candidates] : [];
  if (!queue.length) return;

  const { creatureId = 'unknown', animationName = 'unknown', logPrefix = '[creature-assets]' } = context;

  const tryNext = () => {
    const next = queue.shift();
    if (!next) {
      img.onerror = null;
      return;
    }
    img.src = next;
  };

  img.onerror = () => {
    const failedSrc = img.currentSrc || img.src;
    const next = queue[0];
    if (next) {
      console.warn(`${logPrefix} failed to load, trying fallback`, {
        creatureId,
        animationName,
        failedSrc,
        fallbackSrc: next,
      });
    } else {
      console.warn(`${logPrefix} failed to load and no fallback remains`, {
        creatureId,
        animationName,
        failedSrc,
      });
    }
    tryNext();
  };

  tryNext();
}
