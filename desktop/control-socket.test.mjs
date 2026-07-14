import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  createDesktopControlServer,
  normalizeDesktopControl,
  sendDesktopControl,
} from "./control-socket.mjs";

test("desktop controls accept only the four GNOME shortcut actions", () => {
  for (const action of ["toggle-tuck", "show-menu", "target-walk", "target-snowball"]) {
    assert.deepEqual(normalizeDesktopControl({ action }), { action });
  }
  assert.equal(normalizeDesktopControl({ action: "run-shell" }), null);
  assert.equal(normalizeDesktopControl(null), null);
});

test("the GNOME shortcut client reaches the local desktop companion", async () => {
  const socketPath = path.join(
    "/tmp",
    `club-penguin-pet-control-${process.pid}-${Date.now()}.sock`,
  );
  const actions = [];
  const server = await createDesktopControlServer({
    socketPath,
    onControl: ({ action }) => actions.push(action),
  });

  assert.equal(await sendDesktopControl("target-snowball", { socketPath }), true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(actions, ["target-snowball"]);
  await server.close();
});
