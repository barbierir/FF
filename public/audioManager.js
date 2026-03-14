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
const listeners = new Set();

let muted = localStorage.getItem(STORAGE_KEYS.muted) === 'true';
let masterVolume = parseStoredVolume(localStorage.getItem(STORAGE_KEYS.masterVolume));
let desiredMusicTrack = null;
let currentMusicTrack = null;
let awaitingUserGesture = false;

const musicPlayers = {
  game: createAudio(AUDIO_PATHS.game, true),
  match: createAudio(AUDIO_PATHS.match, true),
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
  audio.volume = masterVolume;
  return audio;
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
      void playMusicTrack(desiredMusicTrack);
    }
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

function applyVolume() {
  Object.values(musicPlayers).forEach((player) => {
    player.volume = masterVolume;
  });
  Object.values(sfxPlayers).forEach((player) => {
    player.volume = masterVolume;
  });
}

async function playMusicTrack(track) {
  if (!track || muted) return;
  desiredMusicTrack = track;
  const player = musicPlayers[track];
  if (!player) return;

  if (currentMusicTrack && currentMusicTrack !== track) {
    const current = musicPlayers[currentMusicTrack];
    current.pause();
    current.currentTime = 0;
  }

  currentMusicTrack = track;
  player.currentTime = player.currentTime || 0;
  try {
    await player.play();
  } catch {
    handlePlaybackFailure();
  }
}

function stopAllMusic() {
  Object.values(musicPlayers).forEach((player) => {
    player.pause();
    player.currentTime = 0;
  });
  currentMusicTrack = null;
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
  void playMusicTrack('game');
  notify();
}

export function startMatchMusic() {
  if (desiredMusicTrack === 'match' && currentMusicTrack === 'match' && !musicPlayers.match.paused) return;
  void playMusicTrack('match');
  notify();
}

export function stopMusic() {
  desiredMusicTrack = null;
  stopAllMusic();
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
    stopAllMusic();
  } else if (desiredMusicTrack) {
    void playMusicTrack(desiredMusicTrack);
  }
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
  applyVolume();
  persistState();
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
