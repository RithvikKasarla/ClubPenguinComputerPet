import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function defaultSocketPath() {
  const runtimeDirectory = process.env.XDG_RUNTIME_DIR;
  const uid = typeof process.getuid === "function" ? process.getuid() : "user";
  const base = runtimeDirectory && path.isAbsolute(runtimeDirectory)
    ? runtimeDirectory
    : os.tmpdir();
  return path.join(base, `club-penguin-pet-${uid}.sock`);
}

export function createHookEnvelope(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.hook_event_name !== "string") return null;
  if (typeof payload.session_id !== "string" || payload.session_id.length === 0) return null;
  return {
    hook_event_name: payload.hook_event_name,
    session_id: payload.session_id,
    turn_id: typeof payload.turn_id === "string" ? payload.turn_id : null,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return;
  }
  const envelope = createHookEnvelope(payload);
  if (!envelope) return;

  await new Promise((resolve) => {
    const socket = createConnection(
      process.env.CODEX_PET_SOCKET || defaultSocketPath(),
    );
    const timeout = setTimeout(() => socket.destroy(), 250);
    socket.on("connect", () => socket.end(`${JSON.stringify(envelope)}\n`));
    socket.on("error", resolve);
    socket.on("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {});
}
