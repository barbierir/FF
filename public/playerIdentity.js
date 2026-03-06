import { CREATURES, renderCreatureIdle } from '/app.js';

const VARIANT_SIZE = {
  compact: 44,
  default: 72,
  hero: 132,
};

function findCreature(creatureId) {
  if (!creatureId) return null;
  return CREATURES.find((creature) => creature.id === creatureId) ?? null;
}

function normalizeNickname(creatureNickname) {
  if (!creatureNickname) return null;
  const trimmed = creatureNickname.trim();
  return trimmed || null;
}

function toTitleCase(value) {
  if (!value) return 'Unknown Creature';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

export function getCreaturePresentation(playerId, creatureId, creatureNickname) {
  const creature = findCreature(creatureId);
  const nickname = normalizeNickname(creatureNickname);
  const creatureName = creature?.name ?? (creatureId ? toTitleCase(creatureId) : 'Unknown Creature');
  const resolvedPlayerId = playerId || 'Unknown Player';
  const primaryLabel = nickname || creatureName;
  const secondaryLabel = nickname ? creatureName : resolvedPlayerId;
  return {
    creature,
    nickname,
    creatureName,
    playerId: resolvedPlayerId,
    primaryLabel,
    secondaryLabel,
  };
}

export function createPlayerIdentity({
  playerId,
  creatureId = null,
  creatureNickname = null,
  variant = 'default',
  showGif = true,
  showCreatureName = true,
  showPlayerId = true,
  showNickname = true,
  className = '',
} = {}) {
  const presentation = getCreaturePresentation(playerId, creatureId, creatureNickname);
  const identity = document.createElement('div');
  identity.className = `player-identity player-identity--${variant}${className ? ` ${className}` : ''}`;

  if (showGif) {
    const avatar = document.createElement('div');
    avatar.className = 'player-identity__avatar';
    renderCreatureIdle(avatar, {
      classKey: creatureId || presentation.creature?.id || null,
      size: VARIANT_SIZE[variant] ?? VARIANT_SIZE.default,
      alt: `${presentation.primaryLabel} creature idle`,
    });
    identity.appendChild(avatar);
  }

  const text = document.createElement('div');
  text.className = 'player-identity__text';

  if (showNickname || !presentation.nickname) {
    const primary = document.createElement('div');
    primary.className = 'player-identity__primary';
    primary.textContent = presentation.primaryLabel;
    text.appendChild(primary);
  }

  const meta = [];
  if (showCreatureName && presentation.nickname) {
    meta.push(presentation.creatureName);
  }
  if (showPlayerId) {
    meta.push(`@${presentation.playerId}`);
  }

  if (meta.length) {
    const secondary = document.createElement('div');
    secondary.className = 'player-identity__secondary';
    secondary.textContent = meta.join(' · ');
    text.appendChild(secondary);
  }

  identity.appendChild(text);
  return identity;
}

export function renderPlayerIdentity(container, options) {
  if (!container) return;
  container.replaceChildren(createPlayerIdentity(options));
}
