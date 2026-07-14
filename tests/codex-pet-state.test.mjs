import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPetState,
  reducePetState,
} from "../src/codex-pet-state.mjs";

const event = (type, threadId, at) => ({ type, threadId, at });

test("successful work stays ready and unread until it is acknowledged", () => {
  let state = createPetState();
  state = reducePetState(state, event("thread.running", "thread-a", 10));
  state = reducePetState(state, event("thread.ready", "thread-a", 20));
  state = reducePetState(state, event("thread.idle", "thread-a", 30));

  assert.deepEqual(
    { mode: state.mode, threadId: state.threadId, unread: state.unread },
    { mode: "ready", threadId: "thread-a", unread: true },
  );

  state = reducePetState(state, event("thread.acknowledged", "thread-a", 40));
  assert.deepEqual(
    { mode: state.mode, threadId: state.threadId, unread: state.unread },
    { mode: "idle", threadId: null, unread: false },
  );
});

test("multiple threads use documented priority and most-recent tie breaking", () => {
  let state = createPetState();
  state = reducePetState(state, event("thread.running", "running", 50));
  state = reducePetState(state, event("thread.ready", "ready", 40));
  state = reducePetState(state, event("thread.blocked", "blocked", 30));
  state = reducePetState(state, event("thread.needs_input", "input-old", 20));
  state = reducePetState(state, event("thread.needs_input", "input-new", 60));

  assert.equal(state.mode, "needs_input");
  assert.equal(state.threadId, "input-new");

  state = reducePetState(state, event("thread.running", "input-new", 70));
  state = reducePetState(state, event("thread.idle", "input-old", 80));
  assert.equal(state.mode, "blocked");
  assert.equal(state.threadId, "blocked");
});

test("an unknown reducer event is rejected instead of corrupting state", () => {
  assert.throws(
    () => reducePetState(createPetState(), event("thread.mystery", "thread-a", 1)),
    /Unknown pet state event/,
  );
});

test("acknowledgement clears unread completion without dismissing live work", () => {
  let state = createPetState();
  state = reducePetState(state, event("thread.needs_input", "thread-a", 10));
  state = reducePetState(state, event("thread.acknowledged", "thread-a", 20));

  assert.equal(state.mode, "needs_input");
  assert.equal(state.threadId, "thread-a");
});
