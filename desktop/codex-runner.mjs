import { spawn as nodeSpawn } from "node:child_process";

export const DEFAULT_CODEX_SANDBOX = "read-only";

export function readCodexPrompt(argv) {
  const index = argv.indexOf("--codex");
  if (index === -1) return null;
  const prompt = argv[index + 1];
  if (!prompt || prompt.startsWith("--")) {
    throw new TypeError("--codex requires a task prompt");
  }
  return prompt;
}

export function createCodexExecArgs({ sandbox = DEFAULT_CODEX_SANDBOX } = {}) {
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--sandbox",
    sandbox,
    "-",
  ];
}

export function runCodexExec({
  prompt,
  bridge,
  cwd,
  sandbox = DEFAULT_CODEX_SANDBOX,
  spawn = nodeSpawn,
  onStderr = () => {},
}) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new TypeError("A non-empty Codex task prompt is required");
  }
  if (!bridge || typeof bridge.write !== "function" || typeof bridge.end !== "function") {
    throw new TypeError("A Codex exec pet bridge is required");
  }

  const child = spawn("codex", createCodexExecArgs({ sandbox }), {
    cwd,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let writes = Promise.resolve();
  let spawnError = null;

  child.stdout.on("data", (chunk) => {
    writes = writes.then(() => bridge.write(chunk));
  });
  child.stderr.on("data", onStderr);
  child.on("error", (error) => {
    spawnError = error;
  });
  child.stdin.end(prompt);

  return new Promise((resolve, reject) => {
    child.on("close", (code, signal) => {
      writes
        .then(() => bridge.end())
        .then((state) => {
          if (spawnError) throw spawnError;
          if (code !== 0) {
            throw new Error(`codex exec exited with ${code ?? signal ?? "unknown status"}`);
          }
          resolve(state);
        })
        .catch(reject);
    });
  });
}
