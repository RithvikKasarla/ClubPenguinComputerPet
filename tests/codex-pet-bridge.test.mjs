import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCodexExecPetBridge,
  createCodexPetBridge,
} from "../src/codex-pet-bridge.mjs";

const event = (type, threadId, at) => ({ type, threadId, at });

test("the bridge maps aggregate Codex state to existing penguin actions", async () => {
  const commands = [];
  const pet = { send: async (command) => commands.push(command) };
  const bridge = createCodexPetBridge({ pet });

  await bridge.handle(event("thread.running", "a", 10));
  await bridge.handle(event("thread.ready", "a", 20));
  await bridge.handle(event("thread.running", "b", 30));
  await bridge.handle(event("thread.needs_input", "b", 40));
  await bridge.handle(event("thread.running", "b", 50));
  await bridge.acknowledge("a", 60);

  assert.deepEqual(
    commands.map((command) => command.action),
    ["jackhammer", "dance", "wave", "dance", "jackhammer"],
    "lower-priority activity must not restart the visible animation",
  );
  assert.deepEqual(bridge.getState(), {
    mode: "running",
    threadId: "b",
    unread: false,
    updatedAt: 50,
    threads: {
      a: { mode: "idle", unread: false, updatedAt: 60 },
      b: { mode: "running", unread: false, updatedAt: 50 },
    },
  });
});

test("concurrent state changes send pet commands in lifecycle order", async () => {
  const commands = [];
  const pet = {
    async send(command) {
      await Promise.resolve();
      commands.push(command.action);
    },
  };
  const bridge = createCodexPetBridge({ pet });

  await Promise.all([
    bridge.handle(event("thread.running", "a", 10)),
    bridge.handle(event("thread.ready", "a", 20)),
  ]);

  assert.deepEqual(commands, ["jackhammer", "dance"]);
});

test("the composed exec bridge consumes JSONL and exposes acknowledgement", async () => {
  const commands = [];
  const integration = createCodexExecPetBridge({
    pet: { send: async (command) => commands.push(command.action) },
    now: () => 100,
  });

  await integration.write([
    '{"type":"thread.started","thread_id":"codex-thread"}',
    '{"type":"turn.started"}',
    '{"type":"turn.completed"}',
    "",
  ].join("\n"));
  await integration.acknowledge("codex-thread", 110);
  await integration.end();

  assert.deepEqual(commands, ["jackhammer", "dance", "penguin"]);
  assert.equal(integration.getState().mode, "idle");
});
