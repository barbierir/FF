import {
  MATCH_ANIMATION_NAMES,
  getCreatureAnimationAssetCandidates,
} from '/creatureAnimations.js';

const PRESENTATION_ACTION_TYPES = MATCH_ANIMATION_NAMES.filter((name) => name !== 'idle');

export const DEFAULT_MATCH_ANIMATION_DURATION_MS = 3_000;

export const battlePresentationConfig = Object.freeze({
  introDurationMs: 4_000,
  finishBufferMs: 300,
  finalStates: Object.freeze(['victory', 'defeat']),
  actionDurationsMs: Object.freeze(Object.fromEntries(PRESENTATION_ACTION_TYPES.map((actionType) => [actionType, DEFAULT_MATCH_ANIMATION_DURATION_MS]))),
});

const SOUND_BY_ACTION = Object.freeze({
  prepare: '/audio/actions/prepare.mp3',
  charge: '/audio/actions/charge.mp3',
  attack_normal: '/audio/actions/attack_normal.mp3',
  attack_cataclysm: '/audio/actions/attack_cataclysm.mp3',
  attack_backfire: '/audio/actions/attack_backfire.mp3',
  attack_toxic: '/audio/actions/attack_toxic.mp3',
  hit: '/audio/actions/hit.mp3',
  defend: '/audio/actions/defend.mp3',
  critical_hit: '/audio/actions/critical_hit.mp3',
  stunned: '/audio/actions/stunned.mp3',
  revenge: '/audio/actions/revenge.mp3',
  defeat: '/audio/actions/defeat.mp3',
  victory: '/audio/actions/victory.mp3',
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
  if (!event) return 'prepare';
  if (event.kind === 'ATTACK' && event.outcome === 'CATACLYSM') return 'attack_cataclysm';
  if (event.kind === 'ATTACK' && event.outcome === 'BACKFIRE') return 'attack_backfire';
  if (event.kind === 'ATTACK' && event.outcome === 'TOXIC') return 'attack_toxic';
  if (event.kind === 'ATTACK' && (event.tags || []).includes('CRITICAL_HIT')) return 'critical_hit';
  if (event.kind === 'ATTACK') return 'attack_normal';
  if (event.kind === 'DOT') return 'hit';
  if (event.kind === 'DEFEND') return 'defend';
  if (event.kind === 'VENGEANCE') return 'revenge';
  if (event.kind === 'RECHARGE_EXTRA' || event.kind === 'RECHARGE') return 'charge';
  if (event.kind === 'STUNNED' || (event.tags || []).includes('STUNNED')) return 'stunned';

  devWarn('unknown event kind, using prepare fallback', { kind: event.kind, event });
  return 'prepare';
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
    case 'attack_cataclysm':
      return 'Cataclysm blast!';
    case 'attack_toxic':
      return 'Toxic cloud!';
    case 'attack_backfire':
      return 'Backfire!';
    case 'attack_normal':
      return 'Gas blast!';
    case 'hit':
      return 'Direct hit!';
    case 'defend':
      return 'Blocked!';
    case 'charge':
      return 'Charging up!';
    case 'critical_hit':
      return 'Critical hit!';
    case 'stunned':
      return 'Stunned!';
    case 'revenge':
      return 'Final vengeance!';
    case 'defeat':
      return 'Down!';
    case 'victory':
      return 'Victory!';
    default:
      return 'Preparing...';
  }
}

export { PRESENTATION_ACTION_TYPES };
