import assert from "node:assert/strict";
import { test } from "node:test";

import { ACTIONS } from "../src/actions.mjs";
import { RENDER_SOURCE_MANIFEST } from "../scripts/render-source-manifest.mjs";

test("every action and direction has one fixed-origin render composition", () => {
  for (const [actionId, action] of Object.entries(ACTIONS)) {
    const directions = [null, ...action.directions];
    for (const direction of directions) {
      const key = direction ? `${actionId}:${direction}` : actionId;
      const composition = RENDER_SOURCE_MANIFEST.compositions[key];
      assert.ok(composition, `missing ${key}`);
      assert.equal(composition.fps, 24);
      assert.ok(composition.frameCount > 0);
      for (const layer of composition.layers) {
        assert.equal(layer.frames.length, composition.frameCount);
        assert.equal(layer.frames[0].endsWith("/0.png") || layer.frames[0].endsWith("/00.png") || layer.frames[0].endsWith("/000.png"), true);
      }
    }
  }
  assert.deepEqual(RENDER_SOURCE_MANIFEST.viewport, { width: 160, height: 180 });
  assert.deepEqual(RENDER_SOURCE_MANIFEST.captureSize, { width: 480, height: 540 });
  assert.deepEqual(RENDER_SOURCE_MANIFEST.registration, {
    localBounds: { x: -70, y: -85, width: 160, height: 180 },
    pivot: { x: 70, y: 85 },
    untrimmed: true,
    captureScale: 3,
  });
});

test("jackhammer body and hard hat share all 33 logical ticks", () => {
  const jackhammer = RENDER_SOURCE_MANIFEST.compositions.jackhammer;
  assert.equal(jackhammer.frameCount, 33);
  assert.equal(jackhammer.loopStart, 16);
  assert.equal(jackhammer.layers.length, 2);
  assert.deepEqual(jackhammer.layers.map(({ depth }) => depth), [0, 260]);
  assert.ok(jackhammer.layers.every(({ frames }) => frames.length === 33));
});

test("mopping plays its setup once before repeating the authored work cycle", () => {
  const mop = RENDER_SOURCE_MANIFEST.compositions.mop;
  assert.equal(mop.frameCount, 45);
  assert.equal(mop.loopStart, 12);
  assert.ok(mop.layers.every(({ frames }) => frames.length === 45));
});

test("serving coffee stops after its authored action completes", () => {
  const coffee = RENDER_SOURCE_MANIFEST.compositions.coffee;
  assert.equal(coffee.frameCount, 25);
  assert.equal(coffee.playback, "once");
  assert.equal(coffee.loopStart, undefined);
});

test("special-action source layers and slot depths are declared only in the build manifest", () => {
  const expected = {
    breakdance: [["57.swf", 0], ["5016.swf", 240]],
    hula: [["32.swf", 0], ["212.swf", 220]],
    maracas: [["42.swf", 0], ["335.swf", 240]],
    guitar: [["44.swf", 0], ["233.swf", 240]],
    jackhammer: [["36.swf", 0], ["403.swf", 260]],
    pizza: [["33.swf", 0], ["263.swf", 220], ["424.swf", 260]],
    mop: [["71.swf", 0], ["5084.swf", 240]],
    coffee: [["34.swf", 0], ["262.swf", 220]],
    propeller: [["35.swf", 0], ["407.swf", 260]],
    swim: [["37.swf", 0], ["325.swf", 240]],
  };

  for (const [actionId, layers] of Object.entries(expected)) {
    assert.deepEqual(
      RENDER_SOURCE_MANIFEST.compositions[actionId].layers.map(({ source, depth }) => [
        source.split("/").at(-1),
        depth,
      ]),
      layers,
    );
  }
});

test("Project Flipper's non-linear wave and one-shot throws are explicit", () => {
  const wave = RENDER_SOURCE_MANIFEST.compositions.wave;
  assert.equal(wave.frameCount, 29);
  assert.deepEqual(wave.sourceSequence, [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    4, 5, 6, 7, 8, 9, 10, 11,
    4, 5, 6, 7, 8, 9, 10, 11,
    0,
  ]);
  assert.equal(wave.playback, "once");
  assert.equal(RENDER_SOURCE_MANIFEST.compositions.snowball.playback, "once");
});
