import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTION_CHORDS,
  createDesktopPetController,
  isPointInPetHitbox,
  pointInOverlay,
  randomRoamTarget,
} from "./pet-controller.mjs";

function createClock() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map();

  function later(callback, delay) {
    const id = nextId++;
    tasks.set(id, { at: now + delay, callback });
    return id;
  }

  function advanceBy(duration) {
    const target = now + duration;
    while (true) {
      const next = [...tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!next) break;
      const [id, task] = next;
      tasks.delete(id);
      now = task.at;
      task.callback();
    }
    now = target;
  }

  return {
    later,
    cancel: (id) => tasks.delete(id),
    advanceBy,
    get pending() { return tasks.size; },
  };
}

function createHarness(options = {}) {
  const commands = [];
  const targetModes = [];
  const clock = createClock();
  const controller = createDesktopPetController({
    send: (command) => commands.push(command),
    getBounds: () => ({ x: 100, y: 50, width: 1_000, height: 700 }),
    getCursorPoint: () => ({ x: 850, y: 325 }),
    setTargetMode: (enabled) => targetModes.push(enabled),
    random: () => 0.25,
    clock,
    ...options,
  });
  return { clock, commands, controller, targetModes };
}

test("screen cursor points are translated into overlay coordinates", () => {
  assert.deepEqual(
    pointInOverlay(
      { x: 100, y: 50, width: 1_000, height: 700 },
      { x: 850, y: 325 },
    ),
    { x: 750, y: 275 },
  );
  assert.deepEqual(
    pointInOverlay(
      { x: 100, y: 50, width: 1_000, height: 700 },
      { x: 5_000, y: -50 },
    ),
    { x: 1_000, y: 0 },
  );
});

test("random roaming targets remain inside the penguin footprint bounds", () => {
  assert.deepEqual(
    randomRoamTarget({ width: 1_000, height: 700 }, () => 0.5),
    { x: 500, y: 414 },
  );
});

test("the interactive hitbox follows only the visible penguin footprint", () => {
  const position = { x: 500, y: 600 };
  assert.equal(isPointInPetHitbox(position, { x: 560, y: 500 }), true);
  assert.equal(isPointInPetHitbox(position, { x: 800, y: 500 }), false);
  assert.equal(isPointInPetHitbox(position, { x: 500, y: 300 }), false);
});

test("manual actions interrupt Codex work and then resume a work action", () => {
  const { clock, commands, controller } = createHarness();

  controller.setLifecycle("working");
  controller.perform("dance");
  clock.advanceBy(3_999);
  assert.deepEqual(commands.map((command) => command.action), ["jackhammer", "dance"]);

  clock.advanceBy(1);
  assert.deepEqual(commands.map((command) => command.action), ["jackhammer", "dance", "mop"]);
  assert.equal(controller.getState().lifecycle, "working");
});

test("work heartbeat hooks do not restart work or cancel a manual override", () => {
  const { clock, commands, controller } = createHarness();

  controller.setLifecycle("working");
  controller.perform("hula");
  controller.setLifecycle("working");
  controller.setLifecycle("working");

  assert.deepEqual(commands.map((command) => command.action), ["jackhammer", "hula"]);
  clock.advanceBy(4_000);
  assert.equal(commands.at(-1).action, "mop");
});

test("an explicit idle event clears a temporary manual override", () => {
  const { clock, commands, controller } = createHarness();

  controller.setLifecycle("working");
  controller.perform("hula");
  controller.setLifecycle("idle");

  assert.equal(controller.getState().manualOverride, false);
  assert.equal(controller.getState().lifecycle, "idle");
  assert.equal(commands.at(-1).action, "penguin");
  const commandCount = commands.length;
  clock.advanceBy(10_000);
  assert.equal(commands.length, commandCount);
});

test("approval and stop lifecycle events replace work without claiming failure", () => {
  const { clock, commands, controller } = createHarness();

  controller.setLifecycle("working");
  controller.setLifecycle("needs_input");
  controller.setLifecycle("stopped");

  assert.deepEqual(commands.map((command) => command.action), ["jackhammer", "wave", "dance"]);
  assert.equal(controller.getState().lifecycle, "ready");

  clock.advanceBy(2_500);
  assert.equal(controller.getState().lifecycle, "idle");
});

test("click-to-walk targeting becomes click-through again after a target is selected", () => {
  const { commands, controller, targetModes } = createHarness();

  controller.armWalkTarget();
  controller.targetSelected();
  controller.movementComplete();

  assert.deepEqual(targetModes, [true, false]);
  assert.deepEqual(commands, [
    { v: 1, type: "perform", action: "walk" },
    { v: 1, type: "perform", action: "penguin" },
  ]);
});

test("a failed click-to-walk movement resumes the underlying lifecycle", () => {
  const { commands, controller } = createHarness();

  controller.setLifecycle("working");
  controller.armWalkTarget();
  controller.targetSelected();
  controller.movementFailed();

  assert.equal(controller.getState().manualMovementPending, false);
  assert.equal(controller.getState().manualOverride, false);
  assert.equal(commands.at(-1).type, "perform");
  assert.equal(commands.at(-1).action, "mop");
});

test("a stale movement failure cannot cancel a newer manual action", () => {
  const { commands, controller } = createHarness();

  controller.armWalkTarget();
  controller.targetSelected();
  controller.perform("dance");
  controller.movementFailed();

  assert.equal(controller.getState().manualOverride, true);
  assert.equal(commands.at(-1).action, "dance");
});

test("a stale failure from one walk cannot disarm a newly targeted walk", () => {
  const { controller, targetModes } = createHarness();

  controller.armWalkTarget();
  controller.targetSelected();
  controller.armWalkTarget();
  controller.movementFailed();

  assert.equal(controller.getState().targeting, true);
  assert.equal(controller.getState().manualOverride, true);
  assert.deepEqual(targetModes, [true, false, true]);
});

test("a completed roam waits for the existing roam timer instead of walking continuously", () => {
  const { clock, commands, controller } = createHarness();

  controller.setRoaming(true);
  assert.equal(commands.length, 1);
  controller.movementComplete();
  assert.equal(commands.length, 1);

  clock.advanceBy(8_249);
  assert.equal(commands.length, 1);
  clock.advanceBy(1);
  assert.equal(commands.length, 2);
  assert.equal(commands[1].type, "moveTo");
});

test("needs-input repeats its attention wave until lifecycle changes", () => {
  const { clock, commands, controller } = createHarness();

  controller.setLifecycle("needs_input");
  assert.equal(commands.at(-1).action, "wave");
  clock.advanceBy(1_500);
  assert.equal(commands.at(-1).action, "wave");

  controller.setLifecycle("idle");
  const commandCount = commands.length;
  clock.advanceBy(5_000);
  assert.equal(commands.length, commandCount);
});

test("the snowball shortcut targets the current cursor and resumes base state", () => {
  const { clock, commands, controller } = createHarness();

  controller.setLifecycle("working");
  controller.throwAtCursor();
  assert.deepEqual(commands[1], {
    v: 1,
    type: "throwSnowball",
    target: { x: 750, y: 275 },
  });

  clock.advanceBy(2_500);
  assert.equal(commands.at(-1).type, "perform");
  assert.equal(commands.at(-1).action, "mop");
});

test("the menu can arm a snowball for the next clicked destination", () => {
  const { clock, commands, controller, targetModes } = createHarness();

  controller.armSnowballTarget();
  assert.equal(controller.getState().targetAction, "snowball");
  assert.deepEqual(commands.at(-1), { v: 1, type: "perform", action: "snowball" });
  assert.deepEqual(targetModes, [true]);

  controller.targetSelected();
  assert.equal(controller.getState().targeting, false);
  assert.equal(controller.getState().manualOverride, true);
  assert.deepEqual(targetModes, [true, false]);

  clock.advanceBy(2_500);
  assert.equal(controller.getState().manualOverride, false);
  assert.equal(commands.at(-1).action, "penguin");
});

test("manual actions that supersede click-to-walk restore click-through mode", () => {
  const { controller, targetModes } = createHarness();

  controller.armWalkTarget();
  controller.throwAtCursor();
  assert.equal(controller.getState().targeting, false);
  assert.deepEqual(targetModes, [true, false]);

  controller.armWalkTarget();
  controller.perform("dance");
  assert.equal(controller.getState().targeting, false);
  assert.deepEqual(targetModes, [true, false, true, false]);
});

test("changing the roaming preference does not supersede an armed walk target", () => {
  const { controller, targetModes } = createHarness();

  controller.setRoaming(true);
  controller.armWalkTarget();
  controller.setRoaming(false);

  assert.equal(controller.getState().targeting, true);
  assert.deepEqual(targetModes, [true]);
});

test("roaming pauses while tucked and resumes after wake", () => {
  const { clock, commands, controller } = createHarness();

  controller.setRoaming(true);
  assert.equal(commands[0].type, "moveTo");

  controller.setSuspended(true);
  const countWhileTucked = commands.length;
  clock.advanceBy(20_000);
  assert.equal(commands.length, countWhileTucked);

  controller.setSuspended(false);
  assert.equal(commands.at(-1).type, "moveTo");
});

test("Codex state changes while tucked do not wake or animate the pet", () => {
  const { commands, controller } = createHarness();

  controller.setSuspended(true);
  controller.setLifecycle("working");
  controller.setLifecycle("needs_input");
  assert.deepEqual(commands, []);

  controller.setSuspended(false);
  assert.equal(commands.at(-1).action, "wave");
});

test("action chord defaults cover the agreed manual controls", () => {
  assert.deepEqual(ACTION_CHORDS, {
    J: "jackhammer",
    M: "mop",
    W: "wave",
    D: "dance",
    C: "coffee",
    P: "pizza",
    B: "breakdance",
    G: "guitar",
    H: "hula",
  });
});
