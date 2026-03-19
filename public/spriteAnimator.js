const imageCache = new Map();
const GENERATED_SPRITE_PATH_PATTERN = /^\/assets\/creatures\/([^/]+)\/([^/.]+)\.png$/;
const FRAME_SIZE = 64;
const GRID_SIZE = 4;
const SHEET_SIZE = FRAME_SIZE * GRID_SIZE;
const CREATURE_BASE_COLORS = Object.freeze({
  goblin: [101, 214, 122],
  dragon: [235, 92, 84],
  skunk: [164, 164, 188],
  troll: [129, 214, 116],
  fairy: [233, 146, 255],
  demon: [255, 120, 54],
});

function devDebug(...args) {
  if (typeof window !== 'undefined' && window.DEBUG_ANIMATION) {
    console.debug(...args);
  }
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function resolveGeneratedSpriteMeta(url) {
  const match = typeof url === 'string' ? url.match(GENERATED_SPRITE_PATH_PATTERN) : null;
  if (!match) return null;
  return {
    creatureId: match[1],
    animationName: match[2],
  };
}

function buildGeneratedSpriteSheet({ creatureId, animationName }) {
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_SIZE;
  canvas.height = SHEET_SIZE;
  const ctx = canvas.getContext('2d');
  const [red, green, blue] = CREATURE_BASE_COLORS[creatureId] || CREATURE_BASE_COLORS.goblin;

  for (let frameIndex = 0; frameIndex < GRID_SIZE * GRID_SIZE; frameIndex += 1) {
    const offsetX = (frameIndex % GRID_SIZE) * FRAME_SIZE;
    const offsetY = Math.floor(frameIndex / GRID_SIZE) * FRAME_SIZE;
    const pulse = 0.72 + ((frameIndex / 15) * 0.4);
    const bodyColor = `rgba(${clampByte(red * pulse)}, ${clampByte(green * pulse)}, ${clampByte(blue * pulse)}, 1)`;
    const panelColor = `rgba(${clampByte(red * 0.22)}, ${clampByte(green * 0.22)}, ${clampByte(blue * 0.22)}, 0.35)`;

    let centerX = offsetX + (FRAME_SIZE / 2);
    let centerY = offsetY + (FRAME_SIZE / 2);
    let radiusX = 12 + (frameIndex % GRID_SIZE);
    let radiusY = 15 + Math.floor(frameIndex / GRID_SIZE);

    if (animationName === 'attack') {
      centerX += frameIndex % 2 === 0 ? 6 : -2;
    } else if (animationName === 'hit') {
      centerX -= frameIndex % 3 === 0 ? 5 : 0;
    } else if (animationName === 'backfire') {
      centerX += frameIndex % 2 === 0 ? -6 : 3;
    } else if (animationName === 'recharge') {
      centerY += frameIndex % 2 === 0 ? -4 : -1;
    } else if (animationName === 'victory') {
      centerY -= 6;
    } else if (animationName === 'defeat') {
      centerY += Math.min(18, frameIndex * 2);
      radiusY = Math.max(6, radiusY - Math.floor(frameIndex / 2));
    }

    ctx.fillStyle = panelColor;
    ctx.beginPath();
    ctx.roundRect(offsetX + 4, offsetY + 4, FRAME_SIZE - 8, FRAME_SIZE - 8, 14);
    ctx.fill();

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    const eyeY = centerY - 5;
    ctx.fillStyle = 'rgba(18, 18, 18, 0.94)';
    ctx.beginPath();
    ctx.arc(centerX - 6, eyeY, 2.4, 0, Math.PI * 2);
    ctx.arc(centerX + 6, eyeY, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(18, 18, 18, 0.94)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let step = -7; step <= 7; step += 1) {
      const x = centerX + step;
      let y = centerY + 8;
      if (animationName === 'victory') {
        y += ((step * step) / 30) - 2;
      } else if (animationName === 'defeat') {
        y -= ((step * step) / 30) - 2;
      }
      if (step === -7) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  const image = new Image();
  image.decoding = 'async';
  const dataUrl = canvas.toDataURL('image/png');
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to build generated sprite sheet: ${creatureId}/${animationName}`));
    image.src = dataUrl;
  });
}

export function loadSpriteSheet(url) {
  if (!url) return Promise.reject(new Error('Sprite sheet URL is required'));
  if (imageCache.has(url)) return imageCache.get(url);

  const generatedMeta = resolveGeneratedSpriteMeta(url);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => {
      if (!generatedMeta) {
        reject(new Error(`Failed to load sprite sheet: ${url}`));
        return;
      }

      console.warn('[spriteAnimator] sprite sheet missing, using generated fallback', {
        url,
        creatureId: generatedMeta.creatureId,
        animationName: generatedMeta.animationName,
      });
      buildGeneratedSpriteSheet(generatedMeta).then(resolve).catch(reject);
    };
    image.src = url;
  });

  imageCache.set(url, promise);
  return promise;
}

export function createAnimator({
  canvas,
  image,
  frameCount = 16,
  columns = 4,
  rows = 4,
  fps = 12,
  loop = true,
  holdLastFrame = false,
  palette = null,
  onComplete = null,
  debugLabel = 'sprite',
} = {}) {
  if (!canvas) throw new Error('Animator requires a canvas');
  if (!image) throw new Error('Animator requires an image');

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Animator requires a 2d canvas context');

  let rafId = null;
  let lastTimestamp = 0;
  let accumulatorMs = 0;
  let frameIndex = 0;
  let completed = false;
  const frameDurationMs = 1000 / Math.max(1, fps);
  const safeFrameCount = Math.max(1, Math.min(frameCount, columns * rows));

  function drawFrame(index) {
    const frameWidth = image.width / columns;
    const frameHeight = image.height / rows;
    const col = index % columns;
    const row = Math.floor(index / columns);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (palette) {
      ctx.filter = `hue-rotate(${palette.hue}deg) saturate(${palette.saturation}) brightness(${palette.brightness})`;
    }
    ctx.drawImage(
      image,
      col * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    ctx.restore();
    devDebug('[animation] frame', { debugLabel, frameIndex: index });
  }

  function finish() {
    if (completed) return;
    completed = true;
    if (!holdLastFrame) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      drawFrame(safeFrameCount - 1);
    }
    if (typeof onComplete === 'function') onComplete();
  }

  function tick(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaMs = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    accumulatorMs += deltaMs;

    while (accumulatorMs >= frameDurationMs && !completed) {
      accumulatorMs -= frameDurationMs;
      const nextFrame = frameIndex + 1;
      if (nextFrame >= safeFrameCount) {
        if (loop) {
          frameIndex = 0;
        } else {
          frameIndex = safeFrameCount - 1;
          finish();
          break;
        }
      } else {
        frameIndex = nextFrame;
      }
    }

    if (!completed || holdLastFrame) {
      drawFrame(frameIndex);
    }

    if (!completed) {
      rafId = window.requestAnimationFrame(tick);
    }
  }

  drawFrame(frameIndex);
  rafId = window.requestAnimationFrame(tick);

  return {
    stop() {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    destroy() {
      this.stop();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    getFrameIndex() {
      return frameIndex;
    },
  };
}

export function clearSpriteSheetCache() {
  imageCache.clear();
}
