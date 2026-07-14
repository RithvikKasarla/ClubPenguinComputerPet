import assert from "node:assert/strict";
import { test } from "node:test";

import { createPetRuntime } from "../src/pet-runtime.mjs";

function createClock() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map();

  const schedule = (callback, delay) => {
    const id = nextId++;
    tasks.set(id, { at: now + delay, callback });
    return id;
  };

  function advanceTo(target) {
    while (true) {
      const pending = [...tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!pending) break;
      const [id, task] = pending;
      tasks.delete(id);
      now = task.at;
      task.callback(now);
    }
    now = target;
  }

  return {
    now: () => now,
    frame: (callback) => schedule(callback, 16),
    cancelFrame: (id) => tasks.delete(id),
    later: schedule,
    cancelLater: (id) => tasks.delete(id),
    advanceTo,
    get time() { return now; },
  };
}

function classList(onAdd = () => {}) {
  const values = new Set();
  return {
    add(value) { values.add(value); onAdd(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
  };
}

function createHarness() {
  const clock = createClock();
  const renders = [];
  const effects = {
    children: [],
    append(node) {
      node.parent = this;
      this.children.push(node);
    },
  };
  let landedAt = null;

  globalThis.document = {
    createElement() {
      const node = {
        style: {},
        className: "",
        classList: classList((value) => {
          if (value === "is-landed") landedAt = clock.time;
        }),
        remove() {
          const index = this.parent?.children.indexOf(this) ?? -1;
          if (index >= 0) this.parent.children.splice(index, 1);
        },
      };
      return node;
    },
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };

  const stage = { clientWidth: 800, clientHeight: 500, dataset: {} };
  const actor = {
    style: {},
    dataset: {},
    classList: classList(),
    querySelector: () => null,
  };
  const action = (target = "none") => ({
    label: "test",
    group: "test",
    tags: [],
    target,
  });
  const runtime = createPetRuntime({
    stage,
    actor,
    effects,
    actions: {
      penguin: action(),
      walk: action("playground-point"),
      snowball: action("playground-point"),
    },
    groups: [{ id: "test", label: "Test", description: "" }],
    renderAction: async (actionId, direction) => renders.push([actionId, direction]),
    clock,
  });

  return { actor, clock, effects, getLandedAt: () => landedAt, renders, runtime };
}

test("walking uses the cursor direction and keeps that idle facing at the destination", async () => {
  const { actor, clock, renders, runtime } = createHarness();

  await runtime.send({ type: "perform", action: "walk" });
  const moving = runtime.send({ type: "moveTo", target: { x: 100, y: 200 } });
  await new Promise(setImmediate);
  clock.advanceTo(5_000);
  await moving;

  assert.deepEqual(renders, [
    ["walk", "up-left"],
    ["penguin", "up-left"],
  ]);
  assert.equal(actor.style.left, "100px");
  assert.equal(actor.style.top, "200px");
});

test("snowball throw stays visible independently for 1.5 seconds after landing", async () => {
  const { clock, effects, getLandedAt, renders, runtime } = createHarness();

  await runtime.send({ type: "perform", action: "snowball" });
  await runtime.send({ type: "throwSnowball", target: { x: 700, y: 150 } });
  clock.advanceTo(2_000);
  await Promise.resolve();

  assert.deepEqual(renders, [
    ["snowball", "up-right"],
    ["penguin", "up-right"],
  ]);
  assert.equal(effects.children.length, 1);
  assert.ok(effects.children[0].classList.contains("is-landed"));

  const landedAt = getLandedAt();
  clock.advanceTo(landedAt + 1_499);
  assert.equal(effects.children.length, 1);
  clock.advanceTo(landedAt + 1_500);
  assert.equal(effects.children.length, 0);
});
