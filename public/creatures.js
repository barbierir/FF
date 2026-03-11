import { getCreatureSelectionIdlePath } from '/creatureAnimations.js';
export const CREATURES = [
  {
    id: 'goblin',
    name: 'Goblin',
    idleSrc: getCreatureSelectionIdlePath('goblin'),
    blurb: 'Efficient gas economy specialist.',
    specialAbilityName: 'RECHARGE_EXTRA bonus',
    specialAbilityDescription: 'RECHARGE_EXTRA restores 3 PG for goblin instead of the default 2.',
  },
  {
    id: 'dragon',
    name: 'Dragon',
    idleSrc: getCreatureSelectionIdlePath('dragon'),
    blurb: 'High-pressure attacker.',
    specialAbilityName: 'DRAGON_PLUS1',
    specialAbilityDescription: 'Dragon ATTACK actions apply +1 extra damage compared to base ATTACK damage.',
  },
  {
    id: 'skunk',
    name: 'Skunk',
    idleSrc: getCreatureSelectionIdlePath('skunk'),
    blurb: 'Risk-control attacker.',
    specialAbilityName: 'SKUNK_SAFE_USED',
    specialAbilityDescription: 'One ATTACK can consume safe=true to prevent BACKFIRE once per match.',
  },
  {
    id: 'troll',
    name: 'Troll',
    idleSrc: getCreatureSelectionIdlePath('troll'),
    blurb: 'Retaliation-focused defender.',
    specialAbilityName: 'TROLL_RETAL',
    specialAbilityDescription: 'When troll takes non-zero attack damage, the attacker takes 1 retaliation damage.',
  },
  {
    id: 'fairy',
    name: 'Fairy',
    idleSrc: getCreatureSelectionIdlePath('fairy'),
    blurb: 'Sustain and recovery specialist.',
    specialAbilityName: 'HEAL',
    specialAbilityDescription: 'Only fairy can use HEAL when PG >= 1; HEAL restores PR (2, or 3 when PR <= 7).',
  },
  {
    id: 'demon',
    name: 'Demon',
    idleSrc: getCreatureSelectionIdlePath('demon'),
    blurb: 'Volatile all-rounder.',
    specialAbilityName: 'BASE KIT',
    specialAbilityDescription: 'Demon uses the baseline move kit without class-specific modifiers.',
  },
];

export function getCreatureById(creatureId) {
  return CREATURES.find((creature) => creature.id === creatureId) ?? null;
}