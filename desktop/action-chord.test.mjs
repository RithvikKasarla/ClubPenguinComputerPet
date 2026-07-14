import assert from "node:assert/strict";
import { test } from "node:test";

import { createActionChordController } from "./action-chord.mjs";

test("the action chord temporarily registers keys and cleans them up", () => {
  const callbacks = new Map();
  const removed = [];
  const actions = [];
  let timeoutCallback = null;
  const chord = createActionChordController({
    mapping: { J: "jackhammer", M: "mop" },
    register(key, callback) {
      callbacks.set(key, callback);
      return true;
    },
    unregister(key) { removed.push(key); },
    onAction(action) { actions.push(action); },
    clock: {
      later(callback) { timeoutCallback = callback; return 1; },
      cancel() { timeoutCallback = null; },
    },
  });

  chord.arm();
  assert.equal(chord.isArmed(), true);
  callbacks.get("J")();
  assert.deepEqual(actions, ["jackhammer"]);
  assert.deepEqual(removed.sort(), ["J", "M"]);
  assert.equal(chord.isArmed(), false);

  chord.arm();
  timeoutCallback();
  assert.equal(chord.isArmed(), false);
});
