import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPetInputWindowOptions,
  initialPetInputBounds,
  petInputBounds,
} from "./pet-input-window.mjs";

test("the native input window follows only the penguin hitbox", () => {
  assert.deepEqual(
    petInputBounds(
      { x: -100, y: 30, width: 1_920, height: 1_040 },
      { x: 960, y: 1_018 },
    ),
    { x: 770, y: 898, width: 180, height: 168 },
  );
});

test("the input window starts hidden at a valid work-area coordinate", () => {
  assert.deepEqual(
    initialPetInputBounds({ x: -1_920, y: 24 }),
    { x: -1_920, y: 24, width: 180, height: 168 },
  );
});

test("the pet input window is a small secure transparent surface", () => {
  const options = createPetInputWindowOptions(
    { x: 10, y: 20, width: 180, height: 168 },
    "/workspace/desktop/input-preload.cjs",
  );

  assert.equal(options.frame, false);
  assert.equal(options.transparent, true);
  assert.equal(options.alwaysOnTop, true);
  assert.equal(options.skipTaskbar, true);
  assert.equal(options.focusable, false);
  assert.deepEqual(options.webPreferences, {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload: "/workspace/desktop/input-preload.cjs",
  });
});
