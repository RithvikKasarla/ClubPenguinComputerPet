import assert from "node:assert/strict";
import { test } from "node:test";

import { createCodexExecJsonlAdapter } from "../src/codex-exec-jsonl.mjs";

test("Codex exec JSONL is normalized across arbitrary stream chunks", () => {
  let timestamp = 100;
  const adapter = createCodexExecJsonlAdapter({ now: () => timestamp++ });

  assert.deepEqual(adapter.write('{"type":"thread.started","thread_id":"abc"'), []);
  assert.deepEqual(
    adapter.write('}\n{"type":"turn.started"}\n'),
    [{ type: "thread.running", threadId: "abc", at: 100 }],
  );
  assert.deepEqual(
    adapter.write('{"type":"turn.completed"}\n'),
    [{ type: "thread.ready", threadId: "abc", at: 101 }],
  );
});

test("failed turns and process errors become blocked activity", () => {
  const adapter = createCodexExecJsonlAdapter({ now: () => 50 });

  assert.deepEqual(
    adapter.write([
      '{"type":"thread.started","thread_id":"failed-thread"}',
      '{"type":"turn.failed","error":{"message":"nope"}}',
      '{"type":"error","message":"process crashed"}',
      "",
    ].join("\n")),
    [
      { type: "thread.blocked", threadId: "failed-thread", at: 50 },
      { type: "thread.blocked", threadId: "failed-thread", at: 50 },
    ],
  );
});

test("malformed and incomplete JSONL fail with useful protocol errors", () => {
  const malformed = createCodexExecJsonlAdapter();
  assert.throws(() => malformed.write("not json\n"), /Invalid Codex JSONL record/);

  const incomplete = createCodexExecJsonlAdapter();
  incomplete.write('{"type":"turn.started"');
  assert.throws(() => incomplete.end(), /Incomplete Codex JSONL record/);
});

test("a valid final JSONL record does not require a trailing newline", () => {
  const adapter = createCodexExecJsonlAdapter({ now: () => 75 });
  adapter.write('{"type":"thread.started","thread_id":"final-thread"}\n');
  adapter.write('{"type":"turn.completed"}');

  assert.deepEqual(
    adapter.end(),
    [{ type: "thread.ready", threadId: "final-thread", at: 75 }],
  );
});
