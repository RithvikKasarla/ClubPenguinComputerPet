import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPetKeybindings,
  formatGsettingsStringArray,
  mergePetKeybindingPaths,
  parseGsettingsStringArray,
  removePetKeybindingPaths,
} from "./gnome-shortcuts.mjs";

const hermes =
  "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/hermes-voice-agent/";

test("pet bindings preserve unrelated GNOME shortcuts and never claim F9", () => {
  const merged = mergePetKeybindingPaths([hermes]);
  assert.equal(merged[0], hermes);
  assert.equal(merged.length, 6);

  const bindings = buildPetKeybindings({
    nodePath: "/usr/bin/node",
    clientPath: "/workspace/desktop/control-client.mjs",
  });
  assert.deepEqual(bindings.map(({ binding }) => binding), [
    "<Control>F6",
    "<Control>XF86Tools",
    "<Control>F7",
    "<Control>F8",
    "<Control>F10",
  ]);
  assert.ok(bindings.every(({ command }) => command.includes("/workspace/desktop/control-client.mjs")));
  assert.ok(bindings.some(({ command }) => command.endsWith("'target-walk'")));
  assert.ok(bindings.some(({ command }) => command.endsWith("'target-snowball'")));
});

test("GNOME string-array serialization round trips and removal is scoped", () => {
  const paths = mergePetKeybindingPaths([hermes]);
  assert.deepEqual(parseGsettingsStringArray(formatGsettingsStringArray(paths)), paths);
  assert.deepEqual(removePetKeybindingPaths(paths), [hermes]);
  assert.deepEqual(parseGsettingsStringArray("@as []"), []);
});
