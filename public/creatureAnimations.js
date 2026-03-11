export const MATCH_ANIMATION_NAMES = Object.freeze([
  'idle',
  'prepare',
  'charge',
  'attack_normal',
  'attack_cataclysm',
  'attack_backfire',
  'attack_toxic',
  'hit',
  'defend',
  'critical_hit',
  'stunned',
  'revenge',
  'defeat',
  'victory',
]);

export const SELECTION_ANIMATION_NAMES = Object.freeze(['idle_choose']);

export const ALL_ANIMATION_NAMES = Object.freeze([
  ...MATCH_ANIMATION_NAMES,
  ...SELECTION_ANIMATION_NAMES,
]);

export function getCreatureAnimationAssetPath(creatureId, animationName) {
  return `/creatures/${creatureId}/${animationName}_placeholder.png`;
}

export function getCreatureMatchIdlePath(creatureId) {
  return getCreatureAnimationAssetPath(creatureId, 'idle');
}

export function getCreatureSelectionIdlePath(creatureId) {
  return getCreatureAnimationAssetPath(creatureId, 'idle_choose');
}
