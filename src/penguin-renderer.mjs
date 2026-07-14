const FRAME_DURATION_MS = 1000 / 24;

const browserClock = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

function loadBrowserImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Unable to load render frame: ${url}`)), { once: true });
    image.src = url;
  });
}

function createCanvasSurface(host, viewport) {
  const canvas = document.createElement("canvas");
  canvas.className = "penguin-canvas";
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas2D is unavailable");
  host.replaceChildren(canvas);
  return {
    draw(layers) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const layer of layers) context.drawImage(layer.image, 0, 0);
    },
    dispose() { canvas.remove(); },
  };
}

function compositionKey(actionId, direction) {
  return direction ? `${actionId}:${direction}` : actionId;
}

export function createPenguinRenderer({
  host,
  catalog,
  clock = browserClock,
  loadImage = loadBrowserImage,
  surface,
}) {
  if (catalog.version !== 1 || catalog.fps !== 24
    || !Number.isInteger(catalog.captureSize?.width)
    || !Number.isInteger(catalog.captureSize?.height)) {
    throw new Error("Unsupported penguin render catalog");
  }
  const drawingSurface = surface ?? createCanvasSurface(host, catalog.captureSize);

  const events = new EventTarget();
  const imageCache = new Map();
  let generation = 0;
  let frameRequest = null;
  let active = null;
  let playing = false;
  let disposed = false;
  let elapsedMs = 0;
  let startedAt = 0;
  let lastFrame = -1;
  let completed = false;

  function imageFor(url) {
    if (!imageCache.has(url)) imageCache.set(url, Promise.resolve(loadImage(url)));
    return imageCache.get(url);
  }

  function cancelTick() {
    if (frameRequest !== null) clock.cancel(frameRequest);
    frameRequest = null;
  }

  function frameAt(milliseconds) {
    const absolute = Math.max(0, Math.floor(milliseconds / FRAME_DURATION_MS));
    if (active.playback === "once") return Math.min(active.frameCount - 1, absolute);
    if (absolute < active.frameCount) return absolute;
    const loopStart = active.loopStart ?? 0;
    return loopStart + ((absolute - active.frameCount) % (active.frameCount - loopStart));
  }

  function draw(frameIndex) {
    const layers = active.layers.map((layer) => ({
      ...layer,
      frameIndex,
      image: layer.images[frameIndex],
    }));
    drawingSurface.draw(layers, { compositionId: active.id, frameIndex });
    lastFrame = frameIndex;
  }

  function schedule() {
    cancelTick();
    if (playing && active) frameRequest = clock.request(tick);
  }

  function tick(now) {
    frameRequest = null;
    if (!playing || !active || disposed) return;
    const currentElapsed = elapsedMs + (now - startedAt);
    const frameIndex = frameAt(currentElapsed);
    if (frameIndex !== lastFrame) draw(frameIndex);
    const finished = active.playback === "once"
      && frameIndex === active.frameCount - 1
      && currentElapsed >= active.frameCount * FRAME_DURATION_MS;
    if (finished) {
      completed = true;
      playing = false;
      if (active.generation === generation) {
        events.dispatchEvent(new CustomEvent("complete", {
          detail: { compositionId: active.id, frameIndex },
        }));
      }
    } else {
      frameRequest = clock.request(tick);
    }
  }

  async function play({ actionId, direction }) {
    if (disposed) throw new Error("Penguin renderer is disposed");
    const key = compositionKey(actionId, direction);
    const composition = catalog.compositions[key];
    if (!composition) throw new RangeError(`Unknown render composition: ${key}`);
    const loopStart = composition.loopStart ?? 0;
    if (!Number.isInteger(loopStart) || loopStart < 0 || loopStart >= composition.frameCount) {
      throw new RangeError(`Invalid loop start for render composition: ${key}`);
    }
    const token = ++generation;
    const layers = await Promise.all(composition.layers.map(async (layer) => ({
      role: layer.role,
      depth: layer.depth,
      images: await Promise.all(layer.frames.map(imageFor)),
    })));
    if (token !== generation || disposed) return { status: "superseded" };

    active = {
      ...composition,
      generation: token,
      layers: layers.sort((a, b) => a.depth - b.depth),
    };
    const activeUrls = new Set(composition.layers.flatMap((layer) => layer.frames));
    for (const url of imageCache.keys()) {
      if (!activeUrls.has(url)) imageCache.delete(url);
    }
    elapsedMs = 0;
    startedAt = clock.now();
    lastFrame = -1;
    playing = true;
    completed = false;
    draw(0);
    schedule();
    return { status: "committed", compositionId: key };
  }

  function pause() {
    if (!playing || !active) return;
    elapsedMs += clock.now() - startedAt;
    playing = false;
    cancelTick();
  }

  function resume() {
    if (playing || completed || !active || disposed) return;
    startedAt = clock.now();
    playing = true;
    schedule();
  }

  function seek(frameIndex) {
    if (!active) throw new Error("No penguin composition is active");
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= active.frameCount) {
      throw new RangeError(`Frame must be between 0 and ${active.frameCount - 1}`);
    }
    elapsedMs = frameIndex * FRAME_DURATION_MS;
    startedAt = clock.now();
    completed = false;
    draw(frameIndex);
  }

  function getState() {
    return Object.freeze({
      compositionId: active?.id ?? null,
      frameIndex: lastFrame,
      playing,
      completed,
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    generation += 1;
    cancelTick();
    imageCache.clear();
    active = null;
    playing = false;
    lastFrame = -1;
    completed = false;
    drawingSurface.dispose?.();
  }

  return Object.freeze({ events, play, pause, resume, seek, getState, dispose });
}
