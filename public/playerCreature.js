const PREFIX = 'ff:player:';
const SUFFIX = ':creatureId';

function keyFor(playerId) {
  return `${PREFIX}${playerId}${SUFFIX}`;
}

export function getPlayerCreatureId(playerId) {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(keyFor(playerId));
  if (value === 'goblin' || value === 'dragon' || value === 'skunk' || value === 'troll' || value === 'fairy' || value === 'demon') {
    return value;
  }
  return null;
}

export function setPlayerCreatureId(playerId, creatureId) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(keyFor(playerId), creatureId);
}

export function clearPlayerCreatureId(playerId) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(keyFor(playerId));
}
