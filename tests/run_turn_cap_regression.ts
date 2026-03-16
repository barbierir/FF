import assert from 'node:assert/strict';
import { simulateMatch } from '../src/core/sim/simulate.ts';
import type { MatchInput } from '../src/core/types.ts';

const MAX_MATCH_TURNS = 24;

const input: MatchInput = {
  creatureA: { classKey: 'goblin' },
  creatureB: { classKey: 'goblin' },
  movesA: Array.from({ length: MAX_MATCH_TURNS }, () => ({ type: 'DEFEND' })),
  movesB: Array.from({ length: MAX_MATCH_TURNS }, () => ({ type: 'DEFEND' })),
};

const { events, summary } = simulateMatch(input, 12345n);

assert.equal(summary.turns, MAX_MATCH_TURNS, 'summary turns should stop exactly at cap');
const attackedTurns = new Set(events.filter((e) => e.kind === 'ATTACK' || e.kind === 'DEFEND' || e.kind === 'RECHARGE_EXTRA' || e.kind === 'RECHARGE').map((e) => e.t));
assert.equal(Math.max(...attackedTurns), MAX_MATCH_TURNS, 'no phantom turn beyond cap should be simulated');

console.log('turn cap regression checks passed');
