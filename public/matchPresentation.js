import {
  getActionSound,
  getCreatureAnimationCandidates,
  getCreatureIdleCandidates,
  mapEventToPresentationAction,
  battlePresentationConfig,
  animationPlaybackMeta,
  DEFAULT_MATCH_ANIMATION_DURATION_MS,
} from '/presentationAssets.js';
import { loadImageWithFallback, getDefeatFrozenAssetCandidates } from '/creatureAnimations.js';
import { playOneShotSound } from '/audioManager.js';

function debugLog(...args) {
  if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    console.debug(...args);
  }
}

export const battleAnimationTiming = battlePresentationConfig;

const TURN_TOTAL_MS = 2_000;
const IDLE_PREP_MS = 250;
const CHARGE_START_MS = 250;
const ACTION_START_MS = 900;
const HIT_START_MS = 1_150;
const RECOVERY_START_MS = 1_650;
const CHARGE_SOUND_MS = 250;
const ACTION_SOUND_MS = 1_100;
const ACTION_HOLD_MS = 1_850;
const HIT_HOLD_MS = 1_900;
const BUBBLE_ANIMATION_RESTART_MS = 1;
const BUBBLE_VISIBLE_MS = 1_000;

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

function getAnimationMeta(actionType) {
  return animationPlaybackMeta[actionType] || animationPlaybackMeta.idle;
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
    this.bubbleHideTimer = null;
    this.bubbleEventSequence = 0;
    this.activeTimerHandles = [];
    this.completionTimerHandles = [];
    this.fallbackTimer = null;
    this.animationResetTimers = { A: null, B: null };
    this.finalStateLock = false;
    this.currentHp = { A: 20, B: 20 };
    this.currentAnimations = { A: 'idle', B: 'idle' };
    this.pendingOffsetMs = 0;
    this.transientStateExpiresAtMs = { A: 0, B: 0 };

    this.timelineData = buildMatchPresentationTimeline(this.data?.events || [], this.data?.summary || null);
    this.resultShown = false;
    this.completed = false;
    this.finalStateLock = false;
    this.clearTransientAnimationTimers();
    this.clearBubbleTimer();
  }

  clearTransientTimers() {
    this.pendingOffsetMs = 0;
    this.activeTimerHandles.forEach((handle) => clearTimeout(handle));
    this.activeTimerHandles = [];
    if (this.animationResetTimers.A) {
      clearTimeout(this.animationResetTimers.A);
      this.animationResetTimers.A = null;
    }
    if (this.animationResetTimers.B) {
      clearTimeout(this.animationResetTimers.B);
      this.animationResetTimers.B = null;
    }
  }

  clearCompletionTimers() {
    this.completionTimerHandles.forEach((handle) => clearTimeout(handle));
    this.completionTimerHandles = [];
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  clearAllTimers() {
    this.clearTransientTimers();
    this.clearCompletionTimers();
    this.clearBubbleTimer();
  }

  stop() {
    this.clearAllTimers();
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
    if (!force && this.currentAnimations[side] === actionType && !this.finalStateLock) return;
    this.currentAnimations[side] = actionType;
    const slot = this.root.querySelector(`[data-creature="${side}"] img`);
    if (!slot) return;
    slot.dataset.side = side;
    slot.dataset.animation = actionType;
    slot.dataset.isAttack = isAttackAnimation(actionType) ? 'true' : 'false';
    slot.dataset.frozen = 'false';
    const animationMeta = getAnimationMeta(actionType);
    slot.dataset.loop = animationMeta.shouldLoop ? 'true' : 'false';
    const creatureId = side === 'A' ? this.creatures.a : this.creatures.b;
    const animationCandidates = getCreatureAnimationCandidates(creatureId, actionType);
    const candidates = actionType === 'defeat'
      ? animationCandidates
      : [
        ...animationCandidates,
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

  clearBubbleTimer() {
    if (this.bubbleHideTimer) {
      clearTimeout(this.bubbleHideTimer);
      this.bubbleHideTimer = null;
    }
  }

  showBubble(payload) {
    const bubble = this.root.querySelector('[data-battle-bubble]');
    if (!bubble) return;
    this.clearBubbleTimer();
    const eventId = payload.eventId ?? `bubble_${++this.bubbleEventSequence}`;
    bubble.classList.remove('left', 'right', 'center');
    bubble.classList.add(payload.align || 'center');
    bubble.dataset.state = 'hidden';
    bubble.textContent = payload.text;
    bubble.dataset.eventId = String(eventId);
    bubble.dataset.shownAt = String(payload.shownAtMs ?? Date.now());
    void bubble.offsetWidth;
    const restart = setTimeout(() => {
      if (bubble.dataset.eventId !== String(eventId)) return;
      bubble.dataset.state = 'active';
    }, BUBBLE_ANIMATION_RESTART_MS);
    this.activeTimerHandles.push(restart);
    this.bubbleHideTimer = setTimeout(() => {
      if (bubble.dataset.eventId !== String(eventId)) return;
      this.clearBubble();
    }, Number.isFinite(payload.visibleMs) ? payload.visibleMs : BUBBLE_VISIBLE_MS);
  }

  clearBubble() {
    this.clearBubbleTimer();
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

  clearTransientAnimationTimers() {
    if (this.animationResetTimers.A) {
      clearTimeout(this.animationResetTimers.A);
      this.animationResetTimers.A = null;
    }
    if (this.animationResetTimers.B) {
      clearTimeout(this.animationResetTimers.B);
      this.animationResetTimers.B = null;
    }
    this.transientStateExpiresAtMs = { A: 0, B: 0 };
  }

  setTransientAnimation(side, actionType, expiresAtMs) {
    if (this.finalStateLock) return;
    this.transientStateExpiresAtMs[side] = Math.max(this.transientStateExpiresAtMs[side], expiresAtMs);
    this.setCreatureAnimation(side, actionType, { force: true });
  }

  canReturnToIdle(side, nowMs) {
    return !this.finalStateLock && nowMs >= (this.transientStateExpiresAtMs[side] || 0);
  }

  freezeDefeated(side) {
    const slot = this.root.querySelector(`[data-creature="${side}"] img`);
    if (!slot) return;
    slot.dataset.frozen = 'true';
    slot.dataset.animation = 'defeat_locked';
    slot.dataset.loop = 'false';
    const creatureId = side === 'A' ? this.creatures.a : this.creatures.b;
    const candidates = getDefeatFrozenAssetCandidates(creatureId);
    loadImageWithFallback(slot, candidates, {
      creatureId,
      animationName: 'defeat_locked',
      logPrefix: '[match-presentation]',
    });
    this.currentAnimations[side] = 'defeat_locked';
  }

  enterFinalMatchState(winner) {
    if (this.finalStateLock) return;
    this.finalStateLock = true;
    this.clearTransientTimers();
    this.clearTransientAnimationTimers();

    const badge = this.root.querySelector('[data-result-badge]');
    const showFinalWinLossBubbles = (winningSide) => {
      const losingSide = winningSide === 'A' ? 'B' : 'A';
      this.showBubble({
        text: 'Victory!',
        align: winningSide === 'A' ? 'left' : 'right',
        eventId: `final_victory_${winningSide}`,
      });
      const defeatCaptionTimer = setTimeout(() => {
        this.showBubble({
          text: 'Defeat!',
          align: losingSide === 'A' ? 'left' : 'right',
          eventId: `final_defeat_${losingSide}`,
        });
      }, 700);
      this.completionTimerHandles.push(defeatCaptionTimer);
    };

    if (winner === 'A') {
      badge.textContent = 'Victory';
      this.setCreatureAnimation('A', 'victory', { force: true });
      this.setCreatureAnimation('B', 'defeat', { force: true });
      showFinalWinLossBubbles('A');
      this.playSound('victory', 'victory');
      const defeatMeta = getAnimationMeta('defeat');
      const freezeAfter = Number.isFinite(defeatMeta.freezeAfterMs) ? defeatMeta.freezeAfterMs : getAnimationDurationMs('defeat');
      this.animationResetTimers.B = setTimeout(() => this.freezeDefeated('B'), freezeAfter);
    } else if (winner === 'B') {
      badge.textContent = 'Defeat';
      this.setCreatureAnimation('A', 'defeat', { force: true });
      this.setCreatureAnimation('B', 'victory', { force: true });
      showFinalWinLossBubbles('B');
      this.playSound('victory', 'victory');
      const defeatMeta = getAnimationMeta('defeat');
      const freezeAfter = Number.isFinite(defeatMeta.freezeAfterMs) ? defeatMeta.freezeAfterMs : getAnimationDurationMs('defeat');
      this.animationResetTimers.A = setTimeout(() => this.freezeDefeated('A'), freezeAfter);
    } else {
      badge.textContent = 'Draw';
      this.setCreatureAnimation('A', 'idle', { force: true });
      this.setCreatureAnimation('B', 'idle', { force: true });
      this.clearBubble();
    }

    badge.dataset.state = 'active';
  }

  scheduleAt(baseAtMs, offsetMs, callback, timerGroup = 'transient') {
    const handle = setTimeout(callback, baseAtMs + offsetMs);
    if (timerGroup === 'completion') {
      this.completionTimerHandles.push(handle);
    } else {
      this.activeTimerHandles.push(handle);
    }
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
      if (this.finalStateLock) return;
      this.showBubble({
        text: 'Charging up!',
        align: actor === 'A' ? 'left' : 'right',
        eventId: `${event?.matchId ?? 'match'}_${event?.t ?? 't'}_${actor}_prep`,
      });
    });

    this.scheduleAt(atMs, CHARGE_START_MS, () => {
      if (this.finalStateLock) return;
      this.setTransientAnimation(actor, 'charge', atMs + ACTION_START_MS);
    });

    this.scheduleAt(atMs, CHARGE_SOUND_MS, () => {
      if (this.finalStateLock) return;
      this.playSound('charge', 'charge');
    });

    this.scheduleAt(atMs, ACTION_START_MS, () => {
      if (this.finalStateLock) return;
      const actionAnim = actionType === 'backfire' || isBackfire ? 'backfire' : 'attack';
      this.setTransientAnimation(actor, actionAnim, atMs + ACTION_HOLD_MS);
      if (actionAnim === 'backfire') {
        this.showBubble({
          text: 'Backfire!',
          align: actor === 'A' ? 'left' : 'right',
          eventId: `${event?.matchId ?? 'match'}_${event?.t ?? 't'}_${actor}_backfire`,
        });
        this.triggerBackfireRecoil(actor);
      } else {
        this.showBubble({
          text: isCritical ? 'Critical hit!' : 'Gas blast!',
          align: actor === 'A' ? 'left' : 'right',
          eventId: `${event?.matchId ?? 'match'}_${event?.t ?? 't'}_${actor}_attack_${isCritical ? 'crit' : 'normal'}`,
        });
        this.triggerAttackLunge(actor);
      }
    });

    this.scheduleAt(atMs, ACTION_SOUND_MS, () => {
      if (this.finalStateLock) return;
      if (actionType === 'backfire' || isBackfire) {
        this.playSound('backfire', 'backfire');
      } else {
        this.playAttackSound(turnStep);
      }
    });

    if (shouldHitDefender) {
      this.scheduleAt(atMs, HIT_START_MS, () => {
        if (this.finalStateLock) return;
        this.setTransientAnimation(defender, 'hit', atMs + HIT_HOLD_MS);
        this.playSound('hit', 'hit');
        this.showBubble({
          text: isCritical ? 'Critical impact!' : 'Direct hit!',
          align: defender === 'A' ? 'left' : 'right',
          eventId: `${event?.matchId ?? 'match'}_${event?.t ?? 't'}_${defender}_hit_${isCritical ? 'crit' : 'normal'}`,
        });
        this.triggerTargetPushback(defender);
        if (isCritical) this.triggerArenaShake();
      });
    }

    this.scheduleAt(atMs, RECOVERY_START_MS, () => {
      if (this.finalStateLock) return;
      const isFinalWinningTurn = turnStep.isLastTurn && (this.data?.summary?.winner === 'A' || this.data?.summary?.winner === 'B');
      const nowMs = atMs + RECOVERY_START_MS;
      this.updateHpFromEvent(event);
      this.renderLogEvent(turnStep);
      if (!isFinalWinningTurn) {
        if (this.canReturnToIdle('A', nowMs)) this.setCreatureAnimation('A', 'idle');
        if (this.canReturnToIdle('B', nowMs)) this.setCreatureAnimation('B', 'idle');
      }
      if (!isFinalWinningTurn) this.clearBubble();
    });
  }

  showResult() {
    if (this.resultShown) return;
    this.resultShown = true;
    this.phase = 'result';
    const winner = this.data?.summary?.winner;
    this.enterFinalMatchState(winner);
    if (typeof this.onResult === 'function') {
      this.onResult();
    }
  }

  complete() {
    if (this.completed) return;
    this.completed = true;
    this.phase = 'finished';
    this.clearCompletionTimers();
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
    this.completed = false;
    this.finalStateLock = false;
    this.clearTransientAnimationTimers();
    this.currentHp = { A: 20, B: 20 };
    this.setHpBars();
    this.clearBubble();
    if (this.eventLogRoot) this.eventLogRoot.innerHTML = '';

    this.setCreatureAnimation('A', 'idle');
    this.setCreatureAnimation('B', 'idle');

    const resultBadge = this.root.querySelector('[data-result-badge]');
    resultBadge.dataset.state = 'hidden';
    resultBadge.textContent = '';

    this.showBubble({ text: 'Round start!', align: 'center', eventId: 'round_start' });

    this.pendingOffsetMs = 0;
    this.timelineData.timeline.forEach((step) => {
      this.scheduleAt(step.atMs, 0, () => {
        if (step.phase === 'turn') this.scheduleTurn(step);
        if (step.phase === 'result') this.showResult();
        if (step.phase === 'finished') this.complete();
      }, step.phase === 'finished' ? 'completion' : 'transient');
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
