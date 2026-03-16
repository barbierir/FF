import {
  MATCH_ANIMATION_NAMES,
  getCreatureAnimationAssetCandidates,
} from '/creatureAnimations.js';

const PRESENTATION_ACTION_TYPES = MATCH_ANIMATION_NAMES.filter((name) => name !== 'idle');

export const DEFAULT_MATCH_ANIMATION_DURATION_MS = 1_200;

export const battlePresentationConfig = Object.freeze({
  introDurationMs: 1_200,
  finishBufferMs: 300,
  finalStates: Object.freeze(['victory', 'defeat']),
  actionDurationsMs: Object.freeze({
    charge: 1_200,
    attack: 1_200,
    backfire: 1_200,
    hit: 1_200,
    defeat: 1_500,
    victory: 1_500,
  }),
});

export const animationPlaybackMeta = Object.freeze({
  idle: Object.freeze({ shouldLoop: true }),
  victory: Object.freeze({ shouldLoop: true }),
  attack: Object.freeze({ shouldLoop: false }),
  charge: Object.freeze({ shouldLoop: false }),
  backfire: Object.freeze({ shouldLoop: false }),
  hit: Object.freeze({ shouldLoop: false }),
  defeat: Object.freeze({ shouldLoop: false, freezeAfterMs: battlePresentationConfig.actionDurationsMs.defeat }),
});

const SOUND_BY_ACTION = Object.freeze({
  charge: 'charge',
  attack: 'attack_normal',
  attack_normal: 'attack_normal',
  attack_critical: 'attack_critical',
  hit: 'hit',
  backfire: 'backfire',
  victory: 'victory',
});

const CREATURE_IDS = ['goblin', 'dragon', 'skunk', 'troll', 'fairy', 'demon'];

function devWarn(message, details) {
  if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    console.warn(`[presentation] ${message}`, details);
  }
}

function buildCreatureMap(creatureId) {
  const map = {};
  for (const action of PRESENTATION_ACTION_TYPES) {
    map[action] = getCreatureAnimationAssetCandidates(creatureId, action);
  }
  return Object.freeze(map);
}

export const CREATURE_ANIMATION_MAP = Object.freeze(
  Object.fromEntries(CREATURE_IDS.map((creatureId) => [creatureId, buildCreatureMap(creatureId)])),
);

export const CREATURE_IDLE_MAP = Object.freeze({
  goblin: getCreatureAnimationAssetCandidates('goblin', 'idle'),
  dragon: getCreatureAnimationAssetCandidates('dragon', 'idle'),
  skunk: getCreatureAnimationAssetCandidates('skunk', 'idle'),
  troll: getCreatureAnimationAssetCandidates('troll', 'idle'),
  fairy: getCreatureAnimationAssetCandidates('fairy', 'idle'),
  demon: getCreatureAnimationAssetCandidates('demon', 'idle'),
});

export function mapEventToPresentationAction(event) {
  if (!event) return 'charge';
  if (event.kind === 'ATTACK' && event.outcome === 'BACKFIRE') return 'backfire';
  if (event.kind === 'ATTACK') return 'attack';
  if (event.kind === 'DOT') return 'hit';
  if (event.kind === 'RECHARGE_EXTRA' || event.kind === 'RECHARGE') return 'charge';

  devWarn('unknown event kind, using charge fallback', { kind: event.kind, event });
  return 'charge';
}

export function getActionSound(actionType) {
  return SOUND_BY_ACTION[actionType] || null;
}

export function getCreatureAnimationCandidates(creatureId, actionType) {
  const normalizedCreature = CREATURE_ANIMATION_MAP[creatureId] ? creatureId : 'goblin';
  const creatureMap = CREATURE_ANIMATION_MAP[normalizedCreature];
  return creatureMap[actionType] || CREATURE_IDLE_MAP[normalizedCreature];
}

export function getCreatureAnimationPath(creatureId, actionType) {
  return getCreatureAnimationCandidates(creatureId, actionType)[0];
}

export function getCreatureIdleCandidates(creatureId) {
  return CREATURE_IDLE_MAP[creatureId] || CREATURE_IDLE_MAP.goblin;
}

export function getCreatureIdlePath(creatureId) {
  return getCreatureIdleCandidates(creatureId)[0];
}

export function getBubbleText(actionType) {
  switch (actionType) {
    case 'charge':
      return 'Charging up!';
    case 'attack':
      return 'Gas blast!';
    case 'backfire':
      return 'Backfire!';
    case 'hit':
      return 'Direct hit!';
    case 'defeat':
      return 'Down!';
    case 'victory':
      return 'Victory!';
    default:
      return 'Preparing...';
  }
}

export { PRESENTATION_ACTION_TYPES };
