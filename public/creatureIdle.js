function createFallback(classKey, size, alt) {
  const fallback = document.createElement('div');
  fallback.className = 'creature-fallback';
  fallback.style.width = `${size}px`;
  fallback.style.height = `${size}px`;
  fallback.setAttribute('role', 'img');
  fallback.setAttribute('aria-label', alt ?? `${classKey} idle fallback`);

  const emoji = document.createElement('span');
  emoji.setAttribute('aria-hidden', 'true');
  emoji.textContent = '💨';

  const label = document.createElement('span');
  label.textContent = classKey;

  fallback.append(emoji, label);
  return fallback;
}

export function renderCreatureIdle(container, { classKey, size = 72, alt } = {}) {
  if (!container) return;
  const safeClassKey = typeof classKey === 'string' && classKey.trim() ? classKey.trim() : 'unknown';
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
      img.src = `/creatures/idle/${safeClassKey}.webp`;
      return;
    }
    if (state === 'gif') {
      img.src = `/creatures/idle/${safeClassKey}.gif`;
      return;
    }
    shell.replaceChildren(createFallback(safeClassKey, size, alt));
  };

  img.onerror = () => {
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
