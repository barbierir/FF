import {
  getActionSound,
  getBubbleText,
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
    .filter((step) => step.phase === 'action')
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

function toBubbleText(event) {
  return getBubbleText(getPresentationActionType(event));
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

function getStepBubbleText(stepEvent) {
  if (stepEvent.bubbleText) return stepEvent.bubbleText;
  if (stepEvent.actionType === 'hit') return 'Direct hit!';
  if (stepEvent.actionType === 'defeat') return 'Down!';
  return toBubbleText(stepEvent.event);
}

export function getCreatureAnimation(creatureId, actionType) {
  return getCreatureAnimationCandidates(creatureId || 'goblin', actionType)[0];
}

export function buildMatchPresentationTimeline(events = [], summary = null) {
  const timeline = [];
  const safeEvents = Array.isArray(events) ? events : [];
  const actionPhaseStartMs = battleAnimationTiming.introDurationMs;
  let nextActionAtMs = actionPhaseStartMs;
  let actionIndex = 0;

  const pushStep = (step) => {
    timeline.push({
      key: `action_${actionIndex++}_${step.atMs}_${step.actionType}_${step.actor}`,
      phase: 'action',
      ...step,
      bubbleText: step.bubbleText || mapActionBubbleText(step.actionType),
      durationMs: step.durationMs ?? getAnimationDurationMs(step.actionType),
    });
  };

  timeline.push({ key: 'intro', atMs: 0, phase: 'intro', label: 'Arena online' });

  safeEvents.forEach((event) => {
    if (!event || (event.actor !== 'A' && event.actor !== 'B')) return;
    const actor = event.actor;
    const defender = actor === 'A' ? 'B' : 'A';

    if (event.kind === 'ATTACK') {
      const chargeDuration = getAnimationDurationMs('charge');
      const attackActionType = event.outcome === 'BACKFIRE' ? 'backfire' : 'attack';
      const attackDuration = getAnimationDurationMs(attackActionType);
      const chargeAtMs = nextActionAtMs;
      const attackAtMs = chargeAtMs + chargeDuration;

      pushStep({
        atMs: chargeAtMs,
        event,
        actionType: 'charge',
        actor,
        reaction: false,
        bubbleText: 'Charging up!',
      });

      pushStep({
        atMs: attackAtMs,
        event,
        actionType: attackActionType,
        actor,
        reaction: false,
      });

      const damageToDefender = defender === 'A' ? event.dmgToA : event.dmgToB;
      if (attackActionType === 'attack' && Number.isFinite(damageToDefender) && damageToDefender > 0) {
        pushStep({
          atMs: attackAtMs + Math.round(attackDuration * 0.4),
          event,
          actionType: 'hit',
          actor: defender,
          reaction: true,
        });
      }

      nextActionAtMs = attackAtMs + attackDuration;
      return;
    }

    if (event.kind === 'RECHARGE' || event.kind === 'RECHARGE_EXTRA') {
      const durationMs = getAnimationDurationMs('charge');
      pushStep({ atMs: nextActionAtMs, event, actionType: 'charge', actor, reaction: false });
      nextActionAtMs += durationMs;
      return;
    }

    if (event.kind === 'DOT') {
      const durationMs = getAnimationDurationMs('hit');
      pushStep({ atMs: nextActionAtMs, event, actionType: 'hit', actor, reaction: true });
      nextActionAtMs += durationMs;
    }
  });

  const actionPhaseEndMs = nextActionAtMs;
  const resultDurationMs = getResultDurationMs(summary);
  const finishAtMs = actionPhaseEndMs + resultDurationMs + battleAnimationTiming.finishBufferMs;

  timeline.push({ key: 'result', atMs: actionPhaseEndMs, phase: 'result', winner: summary?.winner ?? 'DRAW', durationMs: resultDurationMs });
  timeline.push({ key: 'finish', atMs: finishAtMs, phase: 'finished' });

  return {
    durationMs: finishAtMs,
    introDurationMs: battleAnimationTiming.introDurationMs,
    actionStartMs: actionPhaseStartMs,
    resultStartMs: actionPhaseEndMs,
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
    const soundPath = getActionSound(actionType);
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

  isRealHitStep(step) {
    return !!step && step.actionType === 'hit' && step.reaction;
  }

  applyImpactEffects(step) {
    if (!step) return;
    if (step.actionType === 'hit') {
      this.triggerTargetPushback(step.actor);
      const hasCritical = Array.isArray(step?.event?.tags) && step.event.tags.includes('CRITICAL_HIT');
      if (hasCritical) this.triggerArenaShake();
      return;
    }
    if (step.actionType === 'backfire') {
      this.triggerTargetPushback(step.actor);
      return;
    }
    if (step.actionType === 'attack') {
      this.triggerAttackLunge(step.actor);
    }
  }

  getImpactDelayMs() {
    return 0;
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


  playStepSound(step) {
    if (!step) return;
    if (step.actionType === 'charge') return this.playSound('charge', 'charge');
    if (step.actionType === 'backfire') return this.playSound('backfire', 'backfire');
    if (step.actionType === 'hit') return this.playSound('hit', 'hit');
    if (step.actionType === 'victory') return this.playSound('victory', 'victory');
    if (step.actionType === 'attack') {
      const isCritical = Array.isArray(step?.event?.tags) && step.event.tags.includes('CRITICAL_HIT');
      return this.playSound(isCritical ? 'attack_critical' : 'attack_normal', 'attack');
    }
  }

  applyAction(step) {
    const event = step.event;
    debugLog('[presentation] current action type', step.actionType);
    this.phase = 'playing';
    this.currentHp = {
      A: Number.isFinite(event.prA) ? event.prA : this.currentHp.A,
      B: Number.isFinite(event.prB) ? event.prB : this.currentHp.B,
    };
    this.setHpBars();

    const align = step.actor === 'A' ? 'left' : 'right';
    this.showBubble({ text: step.bubbleText, align });
    this.playStepSound(step);
    const actionDurationMs = step.durationMs ?? getAnimationDurationMs(step.actionType);
    debugLog('[presentation] applyAction timing', {
      actionType: step.actionType,
      actor: step.actor,
      actionDurationMs,
    });

    if (step.actor === 'A' || step.actor === 'B') {
      this.setCreatureAnimation(step.actor, step.actionType, { force: true });
      if (this.animationResetTimers[step.actor]) {
        clearTimeout(this.animationResetTimers[step.actor]);
      }
      const shouldResetToIdle = step.actionType !== 'defeat' && step.actionType !== 'victory';
      const resetTimer = setTimeout(() => {
        if (shouldResetToIdle) this.setCreatureAnimation(step.actor, 'idle');
      }, actionDurationMs);
      this.animationResetTimers[step.actor] = resetTimer;
    }

    const bubbleTimer = setTimeout(() => {
      this.clearBubble();
    }, actionDurationMs);
    this.activeTimerHandles.push(bubbleTimer);

    this.applyImpactEffects(step);
    this.renderLogEvent(step);
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
      const scheduledAt = step.atMs + this.pendingOffsetMs;
      const handle = setTimeout(() => {
        if (step.phase === 'action') this.applyAction(step);
        if (step.phase === 'result') this.showResult();
        if (step.phase === 'finished') this.complete();
      }, scheduledAt);
      this.activeTimerHandles.push(handle);
      if (step.phase === 'action') {
        this.pendingOffsetMs += this.getImpactDelayMs(step);
      }
    });

    this.fallbackTimer = setTimeout(() => {
      if (this.phase !== 'finished') {
        this.showResult();
        this.complete();
      }
    }, this.timelineData.durationMs + this.pendingOffsetMs + 100);
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
};
