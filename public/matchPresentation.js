import {
  getActionSound,
  getCreatureAnimationCandidates,
  getCreatureIdleCandidates,
  mapEventToPresentationAction,
  battlePresentationConfig,
  DEFAULT_MATCH_ANIMATION_DURATION_MS,
} from '/presentationAssets.js';
import { loadImageWithFallback } from '/creatureAnimations.js';
import { playOneShotSound } from '/audioManager.js';

function debugLog(...args) {
  if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    console.debug(...args);
  }
}

export const battleAnimationTiming = battlePresentationConfig;

const TURN_TOTAL_MS = 2_400;
const IDLE_PREP_MS = 400;
const CHARGE_START_MS = 400;
const ACTION_START_MS = 1_200;
const HIT_START_MS = 1_500;
const RECOVERY_START_MS = 2_000;
const CHARGE_SOUND_MS = 520;
const ACTION_SOUND_MS = 1_450;

function getAnimationDurationMs(actionType) {
  return battleAnimationTiming.actionDurationsMs[actionType] ?? DEFAULT_MATCH_ANIMATION_DURATION_MS;
}

function getResultDurationMs(summary) {
  if (summary?.winner === 'DRAW') return getAnimationDurationMs('idle');
  return Math.max(getAnimationDurationMs('victory'), getAnimationDurationMs('defeat'));
}

export function estimatePresentationDurationMs(events = [], summary = null) {
  const timeline = buildMatchPresentationTimeline(events, summary);
  const actionDurationMs = timeline.timeline
    .filter((step) => step.phase === 'turn')
    .reduce((total, step) => total + (step.durationMs ?? getAnimationDurationMs(step.actionType)), 0);
  return battleAnimationTiming.introDurationMs + actionDurationMs + getResultDurationMs(summary) + battleAnimationTiming.finishBufferMs;
}

export function getPresentationActionType(event) {
  try {
    return mapEventToPresentationAction(event);
  } catch (error) {
    debugLog('[presentation] failed to map event, using charge fallback', { event, error });
    return 'charge';
  }
}


function mapActionBubbleText(actionType) {
  switch (actionType) {
    case 'attack':
      return 'Gas blast!';
    case 'backfire':
      return 'Backfire!';
    case 'charge':
      return 'Charging up!';
    case 'defeat':
      return 'Down!';
    case 'victory':
      return 'Victory!';
    case 'hit':
      return 'Direct hit!';
    default:
      return 'Preparing...';
  }
}


export function getCreatureAnimation(creatureId, actionType) {
  return getCreatureAnimationCandidates(creatureId || 'goblin', actionType)[0];
}

export function buildMatchPresentationTimeline(events = [], summary = null) {
  const timeline = [];
  const safeEvents = Array.isArray(events) ? events : [];
  const actionPhaseStartMs = battleAnimationTiming.introDurationMs;
  let nextActionAtMs = actionPhaseStartMs;

  timeline.push({ key: 'intro', atMs: 0, phase: 'intro', label: 'Arena online' });

  const turnEvents = safeEvents.filter((event) => event && event.kind === 'ATTACK' && (event.actor === 'A' || event.actor === 'B'));

  turnEvents.forEach((event, index) => {
    if (!event || (event.actor !== 'A' && event.actor !== 'B')) return;
    const actor = event.actor;
    const defender = actor === 'A' ? 'B' : 'A';
    const isLastTurn = index === turnEvents.length - 1;
    const actionType = getPresentationActionType(event);
    const isBackfire = event.kind === 'ATTACK' && event.outcome === 'BACKFIRE';
    const damageToDefender = defender === 'A' ? event.dmgToA : event.dmgToB;
    const shouldHitDefender = event.kind === 'ATTACK' && !isBackfire && Number.isFinite(damageToDefender) && damageToDefender > 0;
    const isCritical = Array.isArray(event?.tags) && event.tags.includes('CRITICAL_HIT');

    timeline.push({
      key: `turn_${index}_${nextActionAtMs}_${actor}_${actionType}`,
      phase: 'turn',
      atMs: nextActionAtMs,
      durationMs: TURN_TOTAL_MS,
      event,
      actor,
      defender,
      actionType,
      isBackfire,
      shouldHitDefender,
      isCritical,
      isLastTurn,
      bubbleText: mapActionBubbleText(actionType),
    });

    nextActionAtMs += TURN_TOTAL_MS;
  });

  const actionPhaseEndMs = nextActionAtMs;
  const resultDurationMs = getResultDurationMs(summary);
  const hasWinner = summary?.winner === 'A' || summary?.winner === 'B';
  const finalTurnStartMs = turnEvents.length ? actionPhaseEndMs - TURN_TOTAL_MS : actionPhaseStartMs;
  const resultAtMs = hasWinner ? finalTurnStartMs + RECOVERY_START_MS : actionPhaseEndMs;
  const finishAtMs = resultAtMs + resultDurationMs + battleAnimationTiming.finishBufferMs;

  timeline.push({ key: 'result', atMs: resultAtMs, phase: 'result', winner: summary?.winner ?? 'DRAW', durationMs: resultDurationMs });
  timeline.push({ key: 'finish', atMs: finishAtMs, phase: 'finished' });

  return {
    durationMs: finishAtMs,
    introDurationMs: battleAnimationTiming.introDurationMs,
    actionStartMs: actionPhaseStartMs,
    resultStartMs: resultAtMs,
    timeline: timeline.sort((a, b) => a.atMs - b.atMs),
  };
}

function isAttackAnimation(actionType) {
  return actionType === 'attack';
}

export class MatchPresentation {
  constructor(config) {
    this.root = config.root;
    this.hpA = config.hpA;
    this.hpB = config.hpB;
    this.eventLogRoot = config.eventLogRoot;
    this.onComplete = config.onComplete;
    this.onResult = config.onResult;
    this.data = config.data;
    this.creatures = config.creatures;

    this.phase = 'intro';
    this.activeBubble = null;
    this.activeTimerHandles = [];
    this.fallbackTimer = null;
    this.animationResetTimers = { A: null, B: null };
    this.currentHp = { A: 20, B: 20 };
    this.currentAnimations = { A: 'idle', B: 'idle' };
    this.pendingOffsetMs = 0;

    this.timelineData = buildMatchPresentationTimeline(this.data?.events || [], this.data?.summary || null);
    this.resultShown = false;
  }

  clearTimers() {
    this.pendingOffsetMs = 0;
    this.activeTimerHandles.forEach((handle) => clearTimeout(handle));
    this.activeTimerHandles = [];
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.animationResetTimers.A) {
      clearTimeout(this.animationResetTimers.A);
      this.animationResetTimers.A = null;
    }
    if (this.animationResetTimers.B) {
      clearTimeout(this.animationResetTimers.B);
      this.animationResetTimers.B = null;
    }
  }

  stop() {
    this.clearTimers();
  }

  playSound(soundKey, fallbackActionType = null) {
    debugLog('[presentation] playSound placeholder', soundKey);
    if (typeof window === 'undefined') return;
    const actionType = fallbackActionType || soundKey;
    const soundPath = getActionSound(soundKey) || getActionSound(actionType);
    if (!soundPath) return;
    void playOneShotSound(soundPath);
  }

  setHpBars() {
    const pctA = Math.max(0, Math.min(100, (this.currentHp.A / 20) * 100));
    const pctB = Math.max(0, Math.min(100, (this.currentHp.B / 20) * 100));
    this.hpA.style.width = `${pctA}%`;
    this.hpB.style.width = `${pctB}%`;
  }

  setCreatureAnimation(side, actionType, options = {}) {
    const { force = false } = options;
    if (!force && this.currentAnimations[side] === actionType) return;
    this.currentAnimations[side] = actionType;
    const slot = this.root.querySelector(`[data-creature="${side}"] img`);
    if (!slot) return;
    slot.dataset.side = side;
    slot.dataset.animation = actionType;
    slot.dataset.isAttack = isAttackAnimation(actionType) ? 'true' : 'false';
    const creatureId = side === 'A' ? this.creatures.a : this.creatures.b;
    const candidates = [
      ...getCreatureAnimationCandidates(creatureId, actionType),
      ...getCreatureIdleCandidates(creatureId),
    ];
    if (force) {
      slot.src = '';
    }
    debugLog('[presentation] animation candidates', side, actionType, candidates);
    loadImageWithFallback(slot, candidates, {
      creatureId,
      animationName: actionType,
      logPrefix: '[match-presentation]',
    });
  }

  showBubble(payload) {
    const bubble = this.root.querySelector('[data-battle-bubble]');
    if (!bubble) return;
    bubble.classList.remove('left', 'right', 'center');
    bubble.classList.add(payload.align || 'center');
    bubble.textContent = payload.text;
    bubble.dataset.state = 'active';
  }

  clearBubble() {
    const bubble = this.root.querySelector('[data-battle-bubble]');
    if (!bubble) return;
    bubble.dataset.state = 'hidden';
    bubble.textContent = '';
  }


  triggerArenaShake() {
    const arenaInner = this.root.querySelector('.battle-stage-inner');
    if (!arenaInner) return;
    arenaInner.classList.remove('arena-hit-shake');
    void arenaInner.offsetWidth;
    arenaInner.classList.add('arena-hit-shake');
  }


  triggerAttackLunge(side) {
    const motionNode = this.root.querySelector(`[data-creature-motion="${side}"]`);
    if (!motionNode) return;
    const className = side === 'A' ? 'attack-lunge-left-creature' : 'attack-lunge-right-creature';
    motionNode.classList.remove(className);
    void motionNode.offsetWidth;
    motionNode.classList.add(className);
  }

  triggerTargetPushback(side) {
    const motionNode = this.root.querySelector(`[data-creature-motion="${side}"]`);
    if (!motionNode) return;
    const className = side === 'A' ? 'hit-push-left-creature' : 'hit-push-right-creature';
    motionNode.classList.remove(className);
    void motionNode.offsetWidth;
    motionNode.classList.add(className);
  }


  triggerBackfireRecoil(side) {
    const motionNode = this.root.querySelector(`[data-creature-motion="${side}"]`);
    if (!motionNode) return;
    const className = side === 'A' ? 'backfire-recoil-left-creature' : 'backfire-recoil-right-creature';
    motionNode.classList.remove(className);
    void motionNode.offsetWidth;
    motionNode.classList.add(className);
  }

  scheduleAt(baseAtMs, offsetMs, callback) {
    const handle = setTimeout(callback, baseAtMs + offsetMs);
    this.activeTimerHandles.push(handle);
  }

  updateHpFromEvent(event) {
    if (!event) return;
    this.currentHp = {
      A: Number.isFinite(event.prA) ? event.prA : this.currentHp.A,
      B: Number.isFinite(event.prB) ? event.prB : this.currentHp.B,
    };
    this.setHpBars();
  }


  renderLogEvent(step) {
    if (!this.eventLogRoot || !step || !step.event) return;
    const event = step.event;
    const line = document.createElement('div');
    const base = `T${event.t ?? '?'} `;
    const detail = step.logText
      ? step.logText
      : `${event.actor ?? '?'} ${event.kind ?? 'UNKNOWN'}${event.outcome ? ` ${event.outcome}` : ''}`;
    line.textContent = `${base}${detail} | HP A:${event.prA ?? '?'} B:${event.prB ?? '?'}`;
    this.eventLogRoot.appendChild(line);
  }

  playAttackSound(turnStep) {
    const key = turnStep.isCritical ? 'attack_critical' : 'attack_normal';
    this.playSound(key, 'attack');
  }

  scheduleTurn(turnStep) {
    if (!turnStep || turnStep.phase !== 'turn') return;
    const { atMs, actor, defender, actionType, shouldHitDefender, isBackfire, isCritical, event } = turnStep;

    this.scheduleAt(atMs, IDLE_PREP_MS, () => {
      this.showBubble({ text: 'Charging up!', align: actor === 'A' ? 'left' : 'right' });
    });

    this.scheduleAt(atMs, CHARGE_START_MS, () => {
      this.setCreatureAnimation(actor, 'charge', { force: true });
    });

    this.scheduleAt(atMs, CHARGE_SOUND_MS, () => {
      this.playSound('charge', 'charge');
    });

    this.scheduleAt(atMs, ACTION_START_MS, () => {
      const actionAnim = actionType === 'backfire' || isBackfire ? 'backfire' : 'attack';
      this.setCreatureAnimation(actor, actionAnim, { force: true });
      if (actionAnim === 'backfire') {
        this.showBubble({ text: 'Backfire!', align: actor === 'A' ? 'left' : 'right' });
        this.triggerBackfireRecoil(actor);
      } else {
        this.showBubble({ text: isCritical ? 'Critical hit!' : 'Gas blast!', align: actor === 'A' ? 'left' : 'right' });
        this.triggerAttackLunge(actor);
      }
    });

    this.scheduleAt(atMs, ACTION_SOUND_MS, () => {
      if (actionType === 'backfire' || isBackfire) {
        this.playSound('backfire', 'backfire');
      } else {
        this.playAttackSound(turnStep);
      }
    });

    if (shouldHitDefender) {
      this.scheduleAt(atMs, HIT_START_MS, () => {
        this.setCreatureAnimation(defender, 'hit', { force: true });
        this.playSound('hit', 'hit');
        this.showBubble({ text: isCritical ? 'Critical impact!' : 'Direct hit!', align: defender === 'A' ? 'left' : 'right' });
        this.triggerTargetPushback(defender);
        if (isCritical) this.triggerArenaShake();
      });
    }

    this.scheduleAt(atMs, RECOVERY_START_MS, () => {
      const isFinalWinningTurn = turnStep.isLastTurn && (this.data?.summary?.winner === 'A' || this.data?.summary?.winner === 'B');
      this.updateHpFromEvent(event);
      this.renderLogEvent(turnStep);
      if (!isFinalWinningTurn) {
        this.setCreatureAnimation('A', 'idle');
        this.setCreatureAnimation('B', 'idle');
      }
      this.clearBubble();
    });
  }

  showResult() {
    if (this.resultShown) return;
    this.resultShown = true;
    this.phase = 'result';
    const badge = this.root.querySelector('[data-result-badge]');
    const winner = this.data?.summary?.winner;

    // Guard against pending action reset timers overwriting terminal result animations.
    if (this.animationResetTimers.A) {
      clearTimeout(this.animationResetTimers.A);
      this.animationResetTimers.A = null;
    }
    if (this.animationResetTimers.B) {
      clearTimeout(this.animationResetTimers.B);
      this.animationResetTimers.B = null;
    }

    if (winner === 'A') {
      badge.textContent = 'Victory';
      this.setCreatureAnimation('A', 'victory');
      this.setCreatureAnimation('B', 'defeat');
      this.showBubble({ text: 'Down!', align: 'right' });
      this.playSound('victory', 'victory');
    } else if (winner === 'B') {
      badge.textContent = 'Defeat';
      this.setCreatureAnimation('A', 'defeat');
      this.setCreatureAnimation('B', 'victory');
      this.showBubble({ text: 'Down!', align: 'left' });
      this.playSound('victory', 'victory');
    } else {
      badge.textContent = 'Draw';
      this.setCreatureAnimation('A', 'idle');
      this.setCreatureAnimation('B', 'idle');
      this.showBubble({ text: 'Still standing!', align: 'center' });
    }

    badge.dataset.state = 'active';
    if (typeof this.onResult === 'function') {
      this.onResult();
    }
  }

  complete() {
    this.phase = 'finished';
    const skipButton = this.root.querySelector('[data-skip]');
    if (skipButton) skipButton.hidden = true;
    if (typeof this.onComplete === 'function') {
      this.onComplete();
    }
  }

  start() {
    this.stop();
    this.phase = 'intro';
    this.resultShown = false;
    this.currentHp = { A: 20, B: 20 };
    this.setHpBars();
    this.clearBubble();
    if (this.eventLogRoot) this.eventLogRoot.innerHTML = '';

    this.setCreatureAnimation('A', 'idle');
    this.setCreatureAnimation('B', 'idle');

    const resultBadge = this.root.querySelector('[data-result-badge]');
    resultBadge.dataset.state = 'hidden';
    resultBadge.textContent = '';

    this.showBubble({ text: 'Round start!', align: 'center' });

    this.pendingOffsetMs = 0;
    this.timelineData.timeline.forEach((step) => {
      const handle = setTimeout(() => {
        if (step.phase === 'turn') this.scheduleTurn(step);
        if (step.phase === 'result') this.showResult();
        if (step.phase === 'finished') this.complete();
      }, step.atMs);
      this.activeTimerHandles.push(handle);
    });

    this.fallbackTimer = setTimeout(() => {
      if (this.phase !== 'finished') {
        this.showResult();
        this.complete();
      }
    }, this.timelineData.durationMs + 100);
  }

  skipToResult() {
    this.stop();
    const events = this.data?.events || [];
    const last = events[events.length - 1];
    if (last) {
      this.currentHp = { A: last.prA, B: last.prB };
      this.setHpBars();
      if (this.eventLogRoot) this.eventLogRoot.innerHTML = '';
      events.forEach((event) => this.renderLogEvent({ event }));
    }
    this.showResult();
    this.complete();
  }
}

export const matchPresentationConstants = {
  INTRO_DURATION_MS: battleAnimationTiming.introDurationMs,
  DEFAULT_MATCH_ANIMATION_DURATION_MS,
  FINISH_BUFFER_MS: battleAnimationTiming.finishBufferMs,
  TURN_TOTAL_MS,
  IDLE_PREP_MS,
  CHARGE_START_MS,
  ACTION_START_MS,
  HIT_START_MS,
  RECOVERY_START_MS,
};
