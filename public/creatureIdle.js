const IDLE_ASSET_BY_CLASS = {
  goblin: "goblin",
  dragon: "dragon",
  skunk: "slime",
  troll: "skeleton",
  fairy: "wizard",
  demon: "demon",
};

const isDev = ["localhost", "127.0.0.1"].includes(window.location.hostname);

function createFallback(classKey, size, alt) {
  const fallback = document.createElement('div');
  fallback.className = 'creature-fallback';
  fallback.style.width = `${size}px`;
  fallback.style.height = `${size}px`;
  fallback.setAttribute('role', 'img');
  fallback.setAttribute('aria-label', alt ?? `${classKey} idle fallback`);

  fallback.textContent = "Missing GIF";
  return fallback;
}

export function renderCreatureIdle(container, { classKey, size = 72, alt } = {}) {
  if (!container) return;
  const safeClassKey = typeof classKey === 'string' && classKey.trim() ? classKey.trim() : 'unknown';
  const assetKey = IDLE_ASSET_BY_CLASS[safeClassKey] ?? safeClassKey;
  container.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'creature-idle-shell';
  shell.style.width = `${size}px`;
  shell.style.height = `${size}px`;

  const img = document.createElement('img');
  img.className = 'creature-idle-image';
  img.width = size;
  img.height = size;
  img.alt = alt ?? `${safeClassKey} idle creature`;
  img.decoding = 'async';

  let state = 'webp';
  const setSrc = () => {
    if (state === 'webp') {
      img.src = `/creatures/idle/${assetKey}.webp`;
      return;
    }
    if (state === 'gif') {
      img.src = `/creatures/idle/${assetKey}.gif`;
      return;
    }
    shell.replaceChildren(createFallback(safeClassKey, size, alt));
  };

  img.onerror = () => {
    if (isDev) {
      console.warn("[renderCreatureIdle] failed to load idle image", {
        creatureId: safeClassKey,
        attemptedSrc: img.currentSrc || img.src,
      });
    }
    if (state === 'webp') {
      state = 'gif';
      setSrc();
      return;
    }
    state = 'fallback';
    setSrc();
  };

  shell.appendChild(img);
  container.appendChild(shell);
  setSrc();
}
