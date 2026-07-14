import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import {
  createCodexExecArgs,
  readCodexPrompt,
  runCodexExec,
} from "./codex-runner.mjs";

test("desktop arguments opt into a Codex-owned task explicitly", () => {
  assert.equal(readCodexPrompt(["electron", "main.mjs"]), null);
  assert.equal(
    readCodexPrompt(["electron", "main.mjs", "--codex", "review this repo"]),
    "review this repo",
  );
  assert.throws(() => readCodexPrompt(["--codex"]), /requires a task prompt/);
});

test("Codex exec uses JSONL, stdin prompts, and least-privilege defaults", () => {
  assert.deepEqual(createCodexExecArgs(), [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "-",
  ]);
});

test("the runner streams lifecycle JSONL through the pet bridge", async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let invocation;
  const chunks = [];
  const bridge = {
    async write(chunk) { chunks.push(chunk.toString()); },
    async end() { return { mode: "ready" }; },
  };

  const completion = runCodexExec({
    prompt: "inspect the project",
    bridge,
    cwd: "/workspace",
    spawn(command, args, options) {
      invocation = { command, args, options };
      return child;
    },
  });
  child.stdout.write('{"type":"turn.started"}\n');
  child.emit("close", 0, null);

  assert.deepEqual(await completion, { mode: "ready" });
  assert.equal(invocation.command, "codex");
  assert.equal(invocation.options.shell, false);
  assert.equal(chunks.join(""), '{"type":"turn.started"}\n');
});

test("a process failure is rejected so the host can show blocked", async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const bridge = { write: async () => {}, end: async () => ({}) };
  const completion = runCodexExec({
    prompt: "fail",
    bridge,
    spawn: () => child,
  });
  child.emit("close", 2, null);
  await assert.rejects(completion, /exited with 2/);
});
