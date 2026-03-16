export const MATCH_ANIMATION_NAMES = Object.freeze([
  'idle',
  'charge',
  'attack',
  'backfire',
  'hit',
  'defeat',
  'victory',
]);

export const SELECTION_ANIMATION_NAMES = Object.freeze(['idle_choose']);

export const ALL_ANIMATION_NAMES = Object.freeze([
  ...MATCH_ANIMATION_NAMES,
  ...SELECTION_ANIMATION_NAMES,
]);

const LEGACY_ANIMATION_NAME_ALIASES = Object.freeze({
  idle: ['idle_goblin'],
  idle_choose: ['idle_goblin'],
});

function buildAssetPath(creatureId, animationName, extension) {
  return `/creatures/${creatureId}/${animationName}.${extension}`;
}

export function getCreatureAnimationAssetCandidates(creatureId, animationName) {
  const normalizedCreatureId = creatureId || 'goblin';
  const normalizedAnimationName = animationName || 'idle';
  const legacyAliases = normalizedCreatureId === 'goblin' ? (LEGACY_ANIMATION_NAME_ALIASES[normalizedAnimationName] ?? []) : [];

  const candidates = [
    buildAssetPath(normalizedCreatureId, normalizedAnimationName, 'gif'),
    ...legacyAliases.map((alias) => buildAssetPath(normalizedCreatureId, alias, 'gif')),
    `/creatures/${normalizedCreatureId}/${normalizedAnimationName}_placeholder.png`,
  ];

  return [...new Set(candidates)];
}

export function getCreatureAnimationAssetPath(creatureId, animationName) {
  return getCreatureAnimationAssetCandidates(creatureId, animationName)[0];
}

export function getCreatureMatchIdlePath(creatureId) {
  return getCreatureAnimationAssetPath(creatureId, 'idle');
}

export function getCreatureSelectionIdlePath(creatureId) {
  return getCreatureAnimationAssetPath(creatureId, 'idle_choose');
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
