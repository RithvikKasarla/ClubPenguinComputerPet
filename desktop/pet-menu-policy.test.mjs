import assert from "node:assert/strict";
import { test } from "node:test";

import { uniformActorMenuItems } from "./pet-menu-policy.mjs";

test("the penguin context menu cannot quit the desktop companion", () => {
  const trayItems = [
    { id: "tuck", label: "Tuck Away" },
    { type: "separator" },
    { id: "roaming", label: "Roaming" },
    { type: "separator" },
    { id: "quit", label: "Quit Penguin" },
  ];

  assert.deepEqual(
    uniformActorMenuItems(trayItems).map(({ id, type }) => id ?? type),
    ["tuck", "roaming"],
  );
  assert.equal(trayItems.at(-1).id, "quit", "the tray menu keeps an explicit quit command");
});
