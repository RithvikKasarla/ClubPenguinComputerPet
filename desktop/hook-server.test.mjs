import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { test } from "node:test";

import { createCodexHookServer } from "./hook-server.mjs";

test("the user-only local socket forwards normalized hook lifecycle", async () => {
  const socketPath = path.join(
    "/tmp",
    `club-penguin-pet-test-${process.pid}-${Date.now()}.sock`,
  );
  const events = [];
  const server = await createCodexHookServer({
    socketPath,
    onLifecycle: (event) => events.push(event),
  });

  const client = createConnection(socketPath);
  await once(client, "connect");
  client.end('{"hook_event_name":"Stop","session_id":"s","prompt":"secret"}\n');
  await once(client, "close");

  assert.deepEqual(events, [{ lifecycle: "stopped", sessionId: "s", turnId: null }]);
  await server.close();
});

test("a socket permission failure closes and removes the listener", async () => {
  const socketPath = path.join(
    "/tmp",
    `club-penguin-pet-chmod-failure-${process.pid}-${Date.now()}.sock`,
  );

  await assert.rejects(
    createCodexHookServer({
      socketPath,
      onLifecycle: () => {},
      chmodSocket: async () => {
        throw new Error("permission setup failed");
      },
    }),
    /permission setup failed/,
  );
  assert.equal(existsSync(socketPath), false);
});
