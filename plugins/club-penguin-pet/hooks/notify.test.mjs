import assert from "node:assert/strict";
import { test } from "node:test";

import {
  approvalsReviewerFromConfig,
  createHookEnvelope,
} from "./notify.mjs";

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

test("automatic approval review does not ask the pet to wave", () => {
  assert.equal(
    createHookEnvelope(
      {
        hook_event_name: "PermissionRequest",
        session_id: "session",
        turn_id: "turn",
      },
      { approvalsReviewer: "auto_review" },
    ),
    null,
  );
});

test("manual approval review still asks the pet to wave", () => {
  assert.equal(
    createHookEnvelope(
      {
        hook_event_name: "PermissionRequest",
        session_id: "session",
      },
      { approvalsReviewer: "user" },
    ).hook_event_name,
    "PermissionRequest",
  );
});

test("only the top-level Codex approval reviewer controls the pet", () => {
  assert.equal(
    approvalsReviewerFromConfig(`
      approvals_reviewer = "auto_review"

      [apps.example]
      approvals_reviewer = "user"
    `),
    "auto_review",
  );
  assert.equal(
    approvalsReviewerFromConfig(`
      [apps.example]
      approvals_reviewer = "auto_review"
    `),
    null,
  );
});
