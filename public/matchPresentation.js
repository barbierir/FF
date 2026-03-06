const MATCH_PRESENTATION_DURATION_MS = 40_000;
const INTRO_DURATION_MS = 4_000;
const ACTION_PHASE_END_MS = 34_000;

const ACTION_TYPE_AUDIO = {
  preparation: '/audio/prepare.mp3',
  attack: '/audio/attack.mp3',
  hit: '/audio/hit.mp3',
  defense: '/audio/defend.mp3',
  counter: '/audio/counter.mp3',
  recovery: '/audio/recovery.mp3',
  defeat: '/audio/defeat.mp3',
  victory: '/audio/victory.mp3',
  system: null,
};

export function getPresentationActionType(event) {
  if (!event) return 'system';
  if (event.kind === 'ATTACK' && event.outcome === 'BACKFIRE') return 'counter';
  if (event.kind === 'ATTACK') return 'attack';
  if (event.kind === 'DEFEND') return 'defense';
  if (event.kind === 'HEAL' || event.kind === 'RECHARGE_EXTRA') return 'recovery';
  if (event.kind === 'DOT') return 'hit';
  if (event.kind === 'VENGEANCE') return 'counter';
  if (event.kind === 'TURN_START' || event.kind === 'SYSTEM') return 'preparation';
  return 'system';
}

function toBubbleText(event) {
  if (event.kind === 'ATTACK' && event.outcome === 'CATACLYSM') return 'Cataclysm blast!';
  if (event.kind === 'ATTACK' && event.outcome === 'TOXIC') return 'Toxic cloud!';
  if (event.kind === 'ATTACK' && event.outcome === 'BACKFIRE') return 'Backfire!';
  if (event.kind === 'ATTACK') return 'Gas blast!';
  if (event.kind === 'DEFEND') return 'Blocked!';
  if (event.kind === 'HEAL') return 'Recovering!';
  if (event.kind === 'DOT') return 'Burning hit!';
  if (event.kind === 'RECHARGE_EXTRA') return 'Charging up!';
  if (event.kind === 'VENGEANCE') return 'Final vengeance!';
  return event.kind || 'Action!';
}

export function getActionSound(actionType) {
  return ACTION_TYPE_AUDIO[actionType] ?? null;
}

export function getCreatureAnimation(creatureId, actionType) {
  const normalized = creatureId || 'goblin';
  const base = `/animations/${normalized}`;
  return `${base}/${actionType}.gif`;
}

export function buildMatchPresentationTimeline(events = [], summary = null) {
  const timeline = [];
  const playableEvents = events.filter((event) => event?.actor === 'A' || event?.actor === 'B');
  const playbackDuration = ACTION_PHASE_END_MS - INTRO_DURATION_MS;
  const spacing = playableEvents.length > 0 ? playbackDuration / playableEvents.length : playbackDuration;

  timeline.push({
    key: 'intro',
    atMs: 0,
    phase: 'intro',
    label: 'Arena online',
  });

  playableEvents.forEach((event, index) => {
    const actionType = getPresentationActionType(event);
    timeline.push({
      key: `action_${index}_${event.t}_${event.kind}`,
      atMs: Math.round(INTRO_DURATION_MS + spacing * index),
      phase: 'action',
      event,
      actionType,
      actor: event.actor,
      bubbleText: toBubbleText(event),
    });
  });

  timeline.push({
    key: 'result',
    atMs: ACTION_PHASE_END_MS,
    phase: 'result',
    winner: summary?.winner ?? 'DRAW',
  });

  timeline.push({
    key: 'finish',
    atMs: MATCH_PRESENTATION_DURATION_MS,
    phase: 'finished',
  });

  return {
    durationMs: MATCH_PRESENTATION_DURATION_MS,
    introDurationMs: INTRO_DURATION_MS,
    actionStartMs: INTRO_DURATION_MS,
    resultStartMs: ACTION_PHASE_END_MS,
    timeline,
  };
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
    this.currentHp = { A: 20, B: 20 };
    this.currentAnimations = { A: 'idle', B: 'idle' };

    this.timelineData = buildMatchPresentationTimeline(this.data?.events || [], this.data?.summary || null);
  }

  clearTimers() {
    this.activeTimerHandles.forEach((handle) => clearTimeout(handle));
    this.activeTimerHandles = [];
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  stop() {
    this.clearTimers();
  }

  playSound(actionType) {
    const soundPath = getActionSound(actionType);
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

  setCreatureAnimation(side, actionType) {
    this.currentAnimations[side] = actionType;
    const slot = this.root.querySelector(`[data-creature="${side}"] img`);
    if (!slot) return;
    const creatureId = side === 'A' ? this.creatures.a : this.creatures.b;
    const candidate = getCreatureAnimation(creatureId, actionType);
    slot.src = candidate;
    slot.onerror = () => {
      slot.onerror = null;
      slot.src = getCreatureAnimation(creatureId, 'idle');
    };
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

  renderLogEvent(event) {
    if (!this.eventLogRoot) return;
    const line = document.createElement('div');
    line.textContent = `T${event.t} ${event.actor} ${event.kind}${event.outcome ? ` ${event.outcome}` : ''} | HP A:${event.prA} B:${event.prB}`;
    this.eventLogRoot.appendChild(line);
  }

  applyAction(step) {
    const event = step.event;
    this.phase = 'playing';
    this.currentHp = {
      A: Number.isFinite(event.prA) ? event.prA : this.currentHp.A,
      B: Number.isFinite(event.prB) ? event.prB : this.currentHp.B,
    };
    this.setHpBars();

    const align = step.actor === 'A' ? 'left' : 'right';
    this.showBubble({ text: step.bubbleText, align });
    this.playSound(step.actionType);

    if (step.actor === 'A' || step.actor === 'B') {
      this.setCreatureAnimation(step.actor, step.actionType);
      const resetTimer = setTimeout(() => {
        this.setCreatureAnimation(step.actor, 'idle');
      }, 900);
      this.activeTimerHandles.push(resetTimer);
    }

    const bubbleTimer = setTimeout(() => {
      this.clearBubble();
    }, 1200);
    this.activeTimerHandles.push(bubbleTimer);

    this.renderLogEvent(event);
  }

  showResult() {
    this.phase = 'result';
    const badge = this.root.querySelector('[data-result-badge]');
    const winner = this.data?.summary?.winner;

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
      this.setCreatureAnimation('A', 'recovery');
      this.setCreatureAnimation('B', 'recovery');
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

    this.timelineData.timeline.forEach((step) => {
      const handle = setTimeout(() => {
        if (step.phase === 'action') this.applyAction(step);
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
      events.forEach((event) => this.renderLogEvent(event));
    }
    this.showResult();
    this.complete();
  }
}

export const matchPresentationConstants = {
  MATCH_PRESENTATION_DURATION_MS,
  INTRO_DURATION_MS,
  ACTION_PHASE_END_MS,
};
