import assert from "node:assert/strict";
import { test } from "node:test";

import { createPenguinRenderer } from "../src/penguin-renderer.mjs";

function fixture({ loadImage = async (url) => url } = {}) {
  let now = 0;
  let nextId = 0;
  const callbacks = new Map();
  const draws = [];
  const clock = {
    now: () => now,
    request(callback) { const id = ++nextId; callbacks.set(id, callback); return id; },
    cancel(id) { callbacks.delete(id); },
    advance(milliseconds) {
      now += milliseconds;
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(now);
    },
  };
  const surface = {
    draw(layers, metadata) { draws.push({ layers, ...metadata }); },
    dispose() {},
  };
  const catalog = {
    version: 1,
    fps: 24,
    captureSize: { width: 160, height: 180 },
    compositions: {
      jackhammer: {
        id: "jackhammer",
        fps: 24,
        playback: "loop",
        frameCount: 3,
        layers: [
          { role: "penguin", depth: 0, frames: ["b0", "b1", "b2"] },
          { role: "head", depth: 260, frames: ["h0", "h1", "h2"] },
        ],
      },
      wave: {
        id: "wave",
        fps: 24,
        playback: "once",
        frameCount: 2,
        layers: [{ role: "penguin", depth: 0, frames: ["w0", "w1"] }],
      },
      dance: {
        id: "dance",
        fps: 24,
        playback: "loop",
        frameCount: 1,
        layers: [{ role: "penguin", depth: 0, frames: ["d0"] }],
      },
      work: {
        id: "work",
        fps: 24,
        playback: "loop",
        loopStart: 2,
        frameCount: 5,
        layers: [{ role: "penguin", depth: 0, frames: ["j0", "j1", "j2", "j3", "j4"] }],
      },
    },
  };
  const renderer = createPenguinRenderer({
    host: null,
    catalog,
    clock,
    surface,
    loadImage,
  });
  return { renderer, clock, draws, catalog };
}

test("one integer playhead selects the same frame for every layer", async () => {
  const { renderer, clock, draws } = fixture();
  await renderer.play({ actionId: "jackhammer" });
  assert.deepEqual(draws.at(-1).layers.map(({ image, frameIndex }) => [image, frameIndex]), [["b0", 0], ["h0", 0]]);

  clock.advance(42);
  assert.deepEqual(draws.at(-1).layers.map(({ image, frameIndex }) => [image, frameIndex]), [["b1", 1], ["h1", 1]]);

  clock.advance(84);
  assert.deepEqual(draws.at(-1).layers.map(({ image, frameIndex }) => [image, frameIndex]), [["b0", 0], ["h0", 0]]);
});

test("a loop start plays the intro once and then repeats only the work cycle", async () => {
  const { renderer, clock, draws } = fixture();
  await renderer.play({ actionId: "work" });

  for (let index = 0; index < 5; index += 1) clock.advance(42);

  assert.deepEqual(draws.map(({ frameIndex }) => frameIndex), [0, 1, 2, 3, 4, 2]);
});

test("an invalid loop start is rejected before playback", async () => {
  const { renderer, catalog } = fixture();
  catalog.compositions.work.loopStart = catalog.compositions.work.frameCount;

  await assert.rejects(
    renderer.play({ actionId: "work" }),
    /loop start/i,
  );
});

test("the renderer is stopped before play and after disposal", async () => {
  const { renderer } = fixture();
  const stopped = {
    compositionId: null,
    frameIndex: -1,
    playing: false,
    completed: false,
  };
  assert.deepEqual(renderer.getState(), stopped);
  await renderer.play({ actionId: "dance" });
  renderer.dispose();
  assert.deepEqual(renderer.getState(), stopped);
});

test("pause, resume, and seek preserve phase", async () => {
  const { renderer, clock, draws } = fixture();
  await renderer.play({ actionId: "jackhammer" });
  clock.advance(42);
  renderer.pause();
  clock.advance(10_000);
  assert.equal(draws.at(-1).frameIndex, 1);

  renderer.resume();
  clock.advance(41);
  assert.equal(draws.at(-1).frameIndex, 1);
  clock.advance(1);
  assert.equal(draws.at(-1).frameIndex, 2);

  renderer.seek(0);
  assert.equal(draws.at(-1).frameIndex, 0);
});

test("one-shot playback completes exactly once and cannot resume itself", async () => {
  const { renderer, clock, draws } = fixture();
  let completions = 0;
  renderer.events.addEventListener("complete", () => { completions += 1; });
  await renderer.play({ actionId: "wave" });

  clock.advance(84);
  assert.equal(draws.at(-1).frameIndex, 1);
  assert.deepEqual(renderer.getState(), {
    compositionId: "wave",
    frameIndex: 1,
    playing: false,
    completed: true,
  });
  assert.equal(completions, 1);

  clock.advance(10_000);
  renderer.resume();
  clock.advance(100);
  assert.equal(completions, 1);
  assert.equal(draws.at(-1).frameIndex, 1);
});

test("a superseded one-shot cannot complete while its replacement loads", async () => {
  let releaseDance;
  const danceImage = new Promise((resolve) => { releaseDance = resolve; });
  const { renderer, clock } = fixture({
    loadImage: (url) => url === "d0" ? danceImage : Promise.resolve(url),
  });
  let completions = 0;
  renderer.events.addEventListener("complete", () => { completions += 1; });
  await renderer.play({ actionId: "wave" });

  const replacing = renderer.play({ actionId: "dance" });
  clock.advance(84);
  assert.equal(completions, 0);

  releaseDance("d0");
  assert.deepEqual(await replacing, { status: "committed", compositionId: "dance" });
  assert.equal(renderer.getState().compositionId, "dance");
});
