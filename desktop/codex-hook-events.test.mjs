import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createHookLifecycleAggregator,
  createJsonLineDecoder,
  normalizeCodexHookEvent,
} from "./codex-hook-events.mjs";

test("Codex hook events become the minimum pet lifecycle envelope", () => {
  assert.deepEqual(
    normalizeCodexHookEvent({
      hook_event_name: "UserPromptSubmit",
      session_id: "session-1",
      turn_id: "turn-1",
      prompt: "must not leave this process",
      transcript_path: "/private/transcript.jsonl",
    }),
    {
      lifecycle: "working",
      sessionId: "session-1",
      turnId: "turn-1",
    },
  );
  assert.equal(
    normalizeCodexHookEvent({
      hook_event_name: "PermissionRequest",
      session_id: "session-1",
    }).lifecycle,
    "needs_input",
  );
  assert.equal(
    normalizeCodexHookEvent({
      hook_event_name: "PostToolUse",
      session_id: "session-1",
    }).lifecycle,
    "working",
  );
  assert.equal(
    normalizeCodexHookEvent({
      hook_event_name: "Stop",
      session_id: "session-1",
    }).lifecycle,
    "stopped",
  );
});

test("unsupported or malformed hook events are ignored", () => {
  assert.equal(normalizeCodexHookEvent(null), null);
  assert.equal(normalizeCodexHookEvent({ hook_event_name: "PreCompact" }), null);
  assert.equal(normalizeCodexHookEvent({ hook_event_name: "Stop" }), null);
});

test("lifecycle aggregation keeps the pet working until every active session stops", () => {
  const aggregate = createHookLifecycleAggregator();

  assert.equal(aggregate({ lifecycle: "working", sessionId: "a" }), "working");
  assert.equal(aggregate({ lifecycle: "working", sessionId: "b" }), "working");
  assert.equal(aggregate({ lifecycle: "stopped", sessionId: "b" }), "working");
  assert.equal(aggregate({ lifecycle: "needs_input", sessionId: "a" }), "needs_input");
  assert.equal(aggregate({ lifecycle: "stopped", sessionId: "a" }), "stopped");
  aggregate.dispose();
});

test("stale hook sessions do not hold the aggregate lifecycle forever", () => {
  let now = 0;
  let expire;
  const changes = [];
  const aggregate = createHookLifecycleAggregator({
    now: () => now,
    staleAfterMs: 100,
    onLifecycleChange: (lifecycle) => changes.push(lifecycle),
    setTimer: (callback) => {
      expire = callback;
      return 1;
    },
    clearTimer: () => {},
  });

  aggregate({ lifecycle: "working", sessionId: "stale" });
  now = 101;
  expire();
  assert.deepEqual(changes, ["stopped"]);
  aggregate.dispose();
});

test("the local hook decoder accepts arbitrary JSONL chunks", () => {
  const records = [];
  const errors = [];
  const decoder = createJsonLineDecoder({
    onRecord: (record) => records.push(record),
    onError: (error) => errors.push(error.message),
  });

  decoder.write('{"hook_event_name":"UserPrompt');
  decoder.write('Submit","session_id":"s"}\nnot-json\n');
  decoder.end();

  assert.equal(records.length, 1);
  assert.equal(records[0].session_id, "s");
  assert.match(errors[0], /Invalid hook JSONL/);
});
