import { chmod, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

import {
  createJsonLineDecoder,
  normalizeCodexHookEvent,
} from "./codex-hook-events.mjs";

export function defaultHookSocketPath({
  runtimeDirectory = process.env.XDG_RUNTIME_DIR,
  uid = typeof process.getuid === "function" ? process.getuid() : "user",
} = {}) {
  const base = runtimeDirectory && path.isAbsolute(runtimeDirectory)
    ? runtimeDirectory
    : os.tmpdir();
  return path.join(base, `club-penguin-pet-${uid}.sock`);
}

async function removeSocket(socketPath) {
  try {
    await unlink(socketPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function createCodexHookServer({
  onLifecycle,
  onError = (error) => console.error("Codex pet hook bridge failed", error),
  socketPath = defaultHookSocketPath(),
  chmodSocket = chmod,
} = {}) {
  if (typeof onLifecycle !== "function") {
    throw new TypeError("onLifecycle(event) is required");
  }

  await removeSocket(socketPath);
  const server = createServer((connection) => {
    const decoder = createJsonLineDecoder({
      onRecord(payload) {
        const event = normalizeCodexHookEvent(payload);
        if (event) onLifecycle(event);
      },
      onError,
    });
    connection.on("data", (chunk) => decoder.write(chunk));
    connection.on("end", () => decoder.end());
    connection.on("error", onError);
  });
  server.on("error", onError);

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    await chmodSocket(socketPath, 0o600);
  } catch (error) {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await removeSocket(socketPath);
    throw error;
  }

  let closed = false;
  return {
    socketPath,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve) => server.close(resolve));
      await removeSocket(socketPath);
    },
  };
}
