import { chmod, unlink } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import os from "node:os";
import path from "node:path";

import { createJsonLineDecoder } from "./codex-hook-events.mjs";

export const DESKTOP_CONTROL_ACTIONS = Object.freeze([
  "toggle-tuck",
  "show-menu",
  "target-walk",
  "target-snowball",
]);
const controlActions = new Set(DESKTOP_CONTROL_ACTIONS);

export function defaultControlSocketPath({
  runtimeDirectory = process.env.XDG_RUNTIME_DIR,
  uid = typeof process.getuid === "function" ? process.getuid() : "user",
} = {}) {
  const base = runtimeDirectory && path.isAbsolute(runtimeDirectory)
    ? runtimeDirectory
    : os.tmpdir();
  return path.join(base, `club-penguin-pet-control-${uid}.sock`);
}

export function normalizeDesktopControl(payload) {
  if (!payload || typeof payload !== "object" || !controlActions.has(payload.action)) {
    return null;
  }
  return { action: payload.action };
}

async function removeSocket(socketPath) {
  try {
    await unlink(socketPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function createDesktopControlServer({
  onControl,
  onError = (error) => console.error("Desktop pet control socket failed", error),
  socketPath = defaultControlSocketPath(),
  chmodSocket = chmod,
} = {}) {
  if (typeof onControl !== "function") throw new TypeError("onControl(control) is required");
  await removeSocket(socketPath);

  const server = createServer((connection) => {
    const decoder = createJsonLineDecoder({
      onRecord(payload) {
        const control = normalizeDesktopControl(payload);
        if (control) onControl(control);
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
    if (server.listening) await new Promise((resolve) => server.close(resolve));
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

export async function sendDesktopControl(action, {
  socketPath = defaultControlSocketPath(),
  timeoutMs = 250,
} = {}) {
  if (!controlActions.has(action)) throw new RangeError(`Unknown desktop control: ${action}`);
  return new Promise((resolve) => {
    let sent = false;
    const socket = createConnection(socketPath);
    const timeout = setTimeout(() => socket.destroy(), timeoutMs);
    socket.on("connect", () => {
      sent = true;
      socket.end(`${JSON.stringify({ action })}\n`);
    });
    socket.on("error", () => resolve(false));
    socket.on("close", () => {
      clearTimeout(timeout);
      resolve(sent);
    });
  });
}
