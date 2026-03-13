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
  if (summary?.winner === 'DRAW') return getAnimationDurationMs('prepare');
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
    debugLog('[presentation] failed to map event, using prepare fallback', { event, error });
    return 'prepare';
  }
}

function toBubbleText(event) {
  return getBubbleText(getPresentationActionType(event));
}

function getStepBubbleText(stepEvent) {
  if (stepEvent.actionType === 'hit') return 'Direct hit!';
  if (stepEvent.actionType === 'stunned') return 'Stunned!';
  if (stepEvent.actionType === 'defeat') return 'Down!';
  return toBubbleText(stepEvent.event);
}

export function getCreatureAnimation(creatureId, actionType) {
  return getCreatureAnimationCandidates(creatureId || 'goblin', actionType)[0];
}

export function buildMatchPresentationTimeline(events = [], summary = null) {
  const timeline = [];
  const safeEvents = Array.isArray(events) ? events : [];
  const playableEvents = [];

  const hasAnyTag = (event, tags) => Array.isArray(event?.tags) && tags.some((tag) => event.tags.includes(tag));
  const isCriticalOutcome = (event) => event?.outcome === 'CATACLYSM' || hasAnyTag(event, ['CRITICAL_HIT']);
  const isStunEvent = (event) => event?.kind === 'STUNNED' || hasAnyTag(event, ['STUNNED', 'STUN', 'APPLY_STUN']);

  const pushActionStep = (event, actionType, actor, metadata = {}) => {
    if (!event || (actor !== 'A' && actor !== 'B')) return;
    playableEvents.push({
      event,
      actionType,
      actor,
      reaction: metadata.reaction === true,
      logText: metadata.logText || null,
      bubbleText: metadata.bubbleText || null,
    });
  };

  const resolveDamageReaction = (event, side, damage) => {
    if (!Number.isFinite(damage) || damage <= 0) return;
    const hpAfter = side === 'A' ? event.prA : event.prB;
    if (Number.isFinite(hpAfter) && hpAfter <= 0) {
      pushActionStep(event, 'defeat', side, {
        reaction: true,
        logText: `${side} is defeated.`,
        bubbleText: 'Down!',
      });
      return;
    }

    const reactionAction = isCriticalOutcome(event) ? 'critical_hit' : 'hit';
    pushActionStep(event, reactionAction, side, {
      reaction: true,
      logText: reactionAction === 'critical_hit'
        ? `${side} takes a critical hit (${damage}).`
        : `${side} takes ${damage} damage.`,
      bubbleText: reactionAction === 'critical_hit' ? 'Critical hit!' : 'Direct hit!',
    });
  };

  const resolveStunTargets = (event) => {
    if (!isStunEvent(event) && !(event?.kind === 'ATTACK' && event?.outcome === 'TOXIC')) return [];
    const sides = [];
    if (event.kind === 'STUNNED' && (event.actor === 'A' || event.actor === 'B')) {
      sides.push(event.actor);
    }
    if (Number.isFinite(event.dmgToA) && event.dmgToA > 0 && event.prA > 0) sides.push('A');
    if (Number.isFinite(event.dmgToB) && event.dmgToB > 0 && event.prB > 0) sides.push('B');
    return [...new Set(sides)];
  };

  safeEvents.forEach((event) => {
    if (!event) return;

    if (event.actor === 'A' || event.actor === 'B') {
      const actionType = getPresentationActionType(event);
      const actorLog = event.kind === 'ATTACK'
        ? `${event.actor} uses ${actionType}.`
        : event.kind === 'VENGEANCE'
          ? `${event.actor} triggers revenge.`
          : `${event.actor} uses ${event.kind?.toLowerCase() || 'action'}.`;
      pushActionStep(event, actionType, event.actor, {
        reaction: false,
        logText: actorLog,
      });
    }

    if (Number.isFinite(event.dmgToA) && event.dmgToA > 0) resolveDamageReaction(event, 'A', event.dmgToA);
    if (Number.isFinite(event.dmgToB) && event.dmgToB > 0) resolveDamageReaction(event, 'B', event.dmgToB);

    resolveStunTargets(event).forEach((side) => {
      pushActionStep(event, 'stunned', side, {
        reaction: true,
        logText: `${side} is stunned.`,
        bubbleText: 'Stunned!',
      });
    });

  });

  const actionPhaseStartMs = battleAnimationTiming.introDurationMs;
  let nextActionAtMs = actionPhaseStartMs;

  timeline.push({
    key: 'intro',
    atMs: 0,
    phase: 'intro',
    label: 'Arena online',
  });

  playableEvents.forEach((stepEvent, index) => {
    const actionType = stepEvent.actionType;
    const durationMs = getAnimationDurationMs(actionType);
    timeline.push({
      key: `action_${index}_${stepEvent.event.t}_${stepEvent.event.kind}_${actionType}_${stepEvent.actor}`,
      atMs: nextActionAtMs,
      phase: 'action',
      event: stepEvent.event,
      actionType,
      durationMs,
      actor: stepEvent.actor,
      reaction: stepEvent.reaction,
      logText: stepEvent.logText,
      bubbleText: stepEvent.bubbleText || getStepBubbleText(stepEvent),
    });
    nextActionAtMs += durationMs;
  });

  const actionPhaseEndMs = nextActionAtMs;
  const resultDurationMs = getResultDurationMs(summary);
  const finishAtMs = actionPhaseEndMs + resultDurationMs + battleAnimationTiming.finishBufferMs;

  timeline.push({
    key: 'result',
    atMs: actionPhaseEndMs,
    phase: 'result',
    winner: summary?.winner ?? 'DRAW',
    durationMs: resultDurationMs,
  });

  timeline.push({
    key: 'finish',
    atMs: finishAtMs,
    phase: 'finished',
  });

  debugLog('[presentation] timeline built length', timeline.length);

  return {
    durationMs: finishAtMs,
    introDurationMs: battleAnimationTiming.introDurationMs,
    actionStartMs: actionPhaseStartMs,
    resultStartMs: actionPhaseEndMs,
    timeline,
  };
}

function isAttackAnimation(actionType) {
  return actionType === 'attack_normal'
    || actionType === 'attack_toxic'
    || actionType === 'attack_cataclysm'
    || actionType === 'attack_backfire';
}

function isGasAttackAnimation(actionType) {
  return actionType === 'attack_toxic';
}

export class MatchPresentation {
  constructor(config) {
    this.root = config.root;
    this.hpA = config.hpA;
    this.hpB = config.hpB;
    this.eventLogRoot = config.eventLogRoot;
    this.onComplete = config.onComplete;
    this.data = config.data;
    this.creatures = config.creatures;

    this.phase = 'intro';
    this.activeBubble = null;
    this.activeTimerHandles = [];
    this.fallbackTimer = null;
    this.animationResetTimers = { A: null, B: null };
    this.currentHp = { A: 20, B: 20 };
    this.currentAnimations = { A: 'idle', B: 'idle' };
    this.hitFreezeDurationMs = 70;
    this.pendingOffsetMs = 0;

    this.timelineData = buildMatchPresentationTimeline(this.data?.events || [], this.data?.summary || null);
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

  playSound(actionType) {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    const soundPath = getActionSound(actionType);
    debugLog('[presentation] sound path', actionType, soundPath);
    if (!soundPath) return;
    try {
      const audio = new Audio(soundPath);
      void audio.play().catch(() => {});
    } catch {
      // no-op: placeholder audio can be missing or blocked
    }
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

  triggerTargetPushback(side) {
    const motionNode = this.root.querySelector(`[data-creature-motion="${side}"]`);
    if (!motionNode) return;
    const className = side === 'A' ? 'hit-push-left-creature' : 'hit-push-right-creature';
    motionNode.classList.remove(className);
    void motionNode.offsetWidth;
    motionNode.classList.add(className);
  }

  triggerGasCloud(attackerSide) {
    const effectsLayer = this.root.querySelector('[data-effects-layer]');
    if (!effectsLayer) return;
    const cloud = document.createElement('div');
    cloud.className = `gas-cloud-effect ${attackerSide === 'A' ? 'from-left' : 'from-right'}`;
    effectsLayer.appendChild(cloud);
    const removeCloud = () => {
      if (cloud.parentNode) cloud.parentNode.removeChild(cloud);
    };
    cloud.addEventListener('animationend', removeCloud, { once: true });
  }

  isRealHitStep(step) {
    if (!step || !step.reaction) return false;
    if (step.actionType !== 'hit' && step.actionType !== 'critical_hit' && step.actionType !== 'defeat') return false;
    const event = step.event;
    if (!event) return false;
    if (step.actor === 'A') return Number.isFinite(event.dmgToA) && event.dmgToA > 0;
    if (step.actor === 'B') return Number.isFinite(event.dmgToB) && event.dmgToB > 0;
    return false;
  }

  applyImpactEffects(step) {
    if (!this.isRealHitStep(step)) return;
    this.triggerArenaShake();
    this.triggerTargetPushback(step.actor);
  }

  getImpactDelayMs(step) {
    return this.isRealHitStep(step) ? this.hitFreezeDurationMs : 0;
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
    this.playSound(step.actionType);
    const actionDurationMs = step.durationMs ?? getAnimationDurationMs(step.actionType);
    if (!step.reaction && isGasAttackAnimation(step.actionType) && (step.actor === 'A' || step.actor === 'B')) {
      this.triggerGasCloud(step.actor);
    }
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
      const resetTimer = setTimeout(() => {
        this.setCreatureAnimation(step.actor, 'idle');
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
    } else if (winner === 'B') {
      badge.textContent = 'Defeat';
      this.setCreatureAnimation('A', 'defeat');
      this.setCreatureAnimation('B', 'victory');
      this.showBubble({ text: 'Down!', align: 'left' });
    } else {
      badge.textContent = 'Draw';
      this.setCreatureAnimation('A', 'prepare');
      this.setCreatureAnimation('B', 'prepare');
      this.showBubble({ text: 'Still standing!', align: 'center' });
    }

    badge.dataset.state = 'active';
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
