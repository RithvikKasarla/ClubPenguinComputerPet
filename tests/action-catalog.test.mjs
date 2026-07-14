import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIONS, ACTION_GROUPS } from "../src/actions.mjs";

test("every pet action has a stable semantic group and automation metadata", () => {
  const groupIds = new Set(ACTION_GROUPS.map((group) => group.id));

  for (const [actionId, action] of Object.entries(ACTIONS)) {
    assert.ok(groupIds.has(action.group), `${actionId} has an unknown group`);
    assert.ok(["loop", "one-shot", "directed"].includes(action.mode));
    assert.ok(Array.isArray(action.tags));
    assert.ok(["none", "playground-point"].includes(action.target));
  }
});

test("requested pet actions are grouped for computer selection", () => {
  assert.equal(ACTIONS.penguin.group, "idle");
  assert.equal(ACTIONS.walk.group, "locomotion");
  assert.equal(ACTIONS.wave.group, "social");
  assert.equal(ACTIONS.dance.group, "music");
  assert.equal(ACTIONS.breakdance.group, "music");
  assert.equal(ACTIONS.coffee.mode, "one-shot");
  assert.equal(ACTIONS.sledFall, undefined, "do not expose a fabricated sled animation");
  assert.equal(ACTIONS.snowball.group, "play");
  assert.equal(ACTIONS.snowball.target, "playground-point");
  assert.deepEqual(ACTIONS.walk.directions, [
    "down", "down-left", "left", "up-left", "up", "up-right", "right", "down-right",
  ]);
  assert.deepEqual(ACTIONS.snowball.directions, [
    "down-left", "up-left", "up-right", "down-right",
  ]);
});
