import assert from "node:assert/strict";
import { test } from "node:test";

import { createHookEnvelope } from "./notify.mjs";

test("the hook bridge strips prompts, transcripts, and tool payloads", () => {
  assert.deepEqual(
    createHookEnvelope({
      hook_event_name: "UserPromptSubmit",
      session_id: "session",
      turn_id: "turn",
      prompt: "secret",
      transcript_path: "/secret",
      tool_input: { command: "secret" },
    }),
    {
      hook_event_name: "UserPromptSubmit",
      session_id: "session",
      turn_id: "turn",
    },
  );
});
