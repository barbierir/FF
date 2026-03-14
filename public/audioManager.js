const STORAGE_KEYS = {
  muted: 'ff:audio:muted',
  masterVolume: 'ff:audio:masterVolume',
};

const AUDIO_PATHS = {
  game: '/audio/music_game.mp3',
  match: '/audio/music_match.mp3',
  win: '/audio/sfx_win.mp3',
  lose: '/audio/sfx_lose.mp3',
  draw: '/audio/sfx_draw.mp3',
};

const DEFAULT_MASTER_VOLUME = 0.7;
const MUSIC_FADE_OUT_MS = 450;
const MUSIC_FADE_IN_MS = 450;
const FADE_TICK_MS = 30;

const listeners = new Set();

let muted = localStorage.getItem(STORAGE_KEYS.muted) === 'true';
let masterVolume = parseStoredVolume(localStorage.getItem(STORAGE_KEYS.masterVolume));
let desiredMusicTrack = null;
let currentMusicTrack = null;
let awaitingUserGesture = false;
let transitionId = 0;

const musicPlayers = {
  game: createAudio(AUDIO_PATHS.game, true),
  match: createAudio(AUDIO_PATHS.match, true),
};

const musicGains = {
  game: 0,
  match: 0,
};

const sfxPlayers = {
  win: createAudio(AUDIO_PATHS.win, false),
  lose: createAudio(AUDIO_PATHS.lose, false),
  draw: createAudio(AUDIO_PATHS.draw, false),
};

function parseStoredVolume(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MASTER_VOLUME;
  return Math.max(0, Math.min(1, parsed));
}

function createAudio(src, loop) {
  const audio = new Audio(src);
  audio.preload = 'none';
  audio.loop = loop;
  audio.volume = 0;
  return audio;
}

function getEffectiveMusicVolume() {
  if (muted) return 0;
  return masterVolume;
}

function setMusicGain(track, gain) {
  const player = musicPlayers[track];
  if (!player) return;
  const clampedGain = Math.max(0, Math.min(1, gain));
  musicGains[track] = clampedGain;
  player.volume = getEffectiveMusicVolume() * clampedGain;
}

function applyVolume() {
  Object.entries(musicPlayers).forEach(([track, player]) => {
    player.volume = getEffectiveMusicVolume() * musicGains[track];
  });
  Object.values(sfxPlayers).forEach((player) => {
    player.volume = muted ? 0 : masterVolume;
  });
}

function notify() {
  const snapshot = getAudioState();
  listeners.forEach((listener) => listener(snapshot));
}

function persistState() {
  localStorage.setItem(STORAGE_KEYS.muted, String(muted));
  localStorage.setItem(STORAGE_KEYS.masterVolume, String(masterVolume));
}

function handlePlaybackFailure() {
  if (awaitingUserGesture) return;
  awaitingUserGesture = true;

  const unlock = () => {
    awaitingUserGesture = false;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);

    if (desiredMusicTrack && !muted) {
      void transitionToTrack(desiredMusicTrack);
    }
  };

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fadeMusicGain(track, startGain, endGain, durationMs, expectedTransitionId) {
  const clampedStart = Math.max(0, Math.min(1, startGain));
  const clampedEnd = Math.max(0, Math.min(1, endGain));

  if (durationMs <= 0 || clampedStart === clampedEnd) {
    if (expectedTransitionId !== transitionId) return false;
    setMusicGain(track, clampedEnd);
    return true;
  }

  const startedAt = performance.now();
  while (true) {
    if (expectedTransitionId !== transitionId) return false;

    const elapsed = performance.now() - startedAt;
    const progress = Math.min(1, elapsed / durationMs);
    const nextGain = clampedStart + (clampedEnd - clampedStart) * progress;
    setMusicGain(track, nextGain);

    if (progress >= 1) {
      return true;
    }

    await wait(FADE_TICK_MS);
  }
}

async function tryPlayMusicPlayer(track, expectedTransitionId) {
  if (expectedTransitionId !== transitionId) return false;
  const player = musicPlayers[track];
  if (!player) return false;

  try {
    await player.play();
    return true;
  } catch {
    if (expectedTransitionId === transitionId) {
      handlePlaybackFailure();
    }
    return false;
  }
}

async function transitionToTrack(track) {
  desiredMusicTrack = track;
  const localTransitionId = ++transitionId;

  if (!track || muted) {
    await stopMusicWithFade(localTransitionId, !track);
    return;
  }

  const nextPlayer = musicPlayers[track];
  if (!nextPlayer) return;

  if (currentMusicTrack === track && !nextPlayer.paused) {
    setMusicGain(track, 1);
    return;
  }

  const previousTrack = currentMusicTrack;

  if (previousTrack && previousTrack !== track) {
    const previousGain = musicGains[previousTrack];
    await fadeMusicGain(previousTrack, previousGain, 0, MUSIC_FADE_OUT_MS, localTransitionId);
    if (localTransitionId !== transitionId) return;

    const previousPlayer = musicPlayers[previousTrack];
    previousPlayer.pause();
    previousPlayer.currentTime = 0;
    setMusicGain(previousTrack, 0);
  }

  if (localTransitionId !== transitionId) return;

  currentMusicTrack = track;
  nextPlayer.currentTime = 0;
  setMusicGain(track, 0);

  const started = await tryPlayMusicPlayer(track, localTransitionId);
  if (!started || localTransitionId !== transitionId) return;

  await fadeMusicGain(track, musicGains[track], 1, MUSIC_FADE_IN_MS, localTransitionId);
}

function stopAllMusicImmediately(clearCurrentTrack = true) {
  Object.entries(musicPlayers).forEach(([track, player]) => {
    player.pause();
    player.currentTime = 0;
    setMusicGain(track, 0);
  });

  if (clearCurrentTrack) {
    currentMusicTrack = null;
  }
}

async function stopMusicWithFade(expectedTransitionId, clearCurrentTrack = true) {
  if (!currentMusicTrack) {
    if (clearCurrentTrack) {
      currentMusicTrack = null;
    }
    return;
  }

  const activeTrack = currentMusicTrack;
  const activePlayer = musicPlayers[activeTrack];
  const activeGain = musicGains[activeTrack];
  await fadeMusicGain(activeTrack, activeGain, 0, MUSIC_FADE_OUT_MS, expectedTransitionId);

  if (expectedTransitionId !== transitionId) return;

  activePlayer.pause();
  activePlayer.currentTime = 0;
  setMusicGain(activeTrack, 0);

  if (clearCurrentTrack) {
    currentMusicTrack = null;
  }
}

async function playSfx(kind) {
  if (muted) return false;
  const player = sfxPlayers[kind];
  if (!player) return false;

  try {
    player.currentTime = 0;
    await player.play();
    return true;
  } catch {
    return false;
  }
}

export async function playOneShotSound(soundPath) {
  if (muted || !soundPath || typeof Audio === 'undefined') return false;

  try {
    const audio = new Audio(soundPath);
    audio.preload = 'none';
    audio.volume = masterVolume;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export function startGameMusic() {
  if (desiredMusicTrack === 'game' && currentMusicTrack === 'game' && !musicPlayers.game.paused) return;
  void transitionToTrack('game');
  notify();
}

export function startMatchMusic() {
  if (desiredMusicTrack === 'match' && currentMusicTrack === 'match' && !musicPlayers.match.paused) return;
  void transitionToTrack('match');
  notify();
}

export function stopMusic() {
  desiredMusicTrack = null;
  const localTransitionId = ++transitionId;
  void stopMusicWithFade(localTransitionId, true);
  notify();
}

export async function playWinSound() {
  return playSfx('win');
}

export async function playLoseSound() {
  return playSfx('lose');
}

export async function playDrawSound() {
  return playSfx('draw');
}

export function setMuted(nextMuted) {
  muted = Boolean(nextMuted);
  persistState();

  if (muted) {
    transitionId += 1;
    stopAllMusicImmediately(false);
  } else if (desiredMusicTrack) {
    void transitionToTrack(desiredMusicTrack);
  }

  applyVolume();
  notify();
}

export function toggleMuted() {
  setMuted(!muted);
}

export function isMuted() {
  return muted;
}

export function setMasterVolume(nextVolume) {
  masterVolume = Math.max(0, Math.min(1, nextVolume));
  persistState();
  applyVolume();
  notify();
}

export function getMasterVolume() {
  return masterVolume;
}

export function getAudioState() {
  return {
    muted,
    masterVolume,
    desiredMusicTrack,
    currentMusicTrack,
    awaitingUserGesture,
  };
}

export function subscribeToAudioState(listener) {
  if (typeof listener !== 'function') return () => {};

  listeners.add(listener);
  listener(getAudioState());
  return () => listeners.delete(listener);
}

export function syncMusicForCurrentPage(pathname = window.location.pathname) {
  const isMatchPage = pathname.startsWith('/m/') || pathname.startsWith('/replay/');
  if (isMatchPage) {
    startMatchMusic();
  } else {
    startGameMusic();
  }
}

applyVolume();
