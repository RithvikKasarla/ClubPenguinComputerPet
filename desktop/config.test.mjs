import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createOverlayWindowOptions,
  INTERACTION_MODES,
  overlayBoundsForWorkArea,
  overlayInputPolicy,
  SHORTCUTS,
  shouldUseElectronGlobalShortcuts,
} from "./config.mjs";

test("overlay covers the full work area so the penguin can cross the desktop", () => {
  assert.deepEqual(
    overlayBoundsForWorkArea({ x: 0, y: 0, width: 1920, height: 1080 }),
    { x: 0, y: 0, width: 1920, height: 1080 },
  );
  assert.deepEqual(
    overlayBoundsForWorkArea({ x: -1280, y: 20, width: 1280, height: 720 }),
    { x: -1280, y: 20, width: 1280, height: 720 },
  );
});

test("window options enforce the desktop overlay contract", () => {
  const options = createOverlayWindowOptions(
    { x: 1, y: 2, width: 3, height: 4 },
    "/workspace/desktop/preload.cjs",
  );

  assert.equal(options.frame, false);
  assert.equal(options.transparent, true);
  assert.equal(options.focusable, true);
  assert.equal(options.alwaysOnTop, true);
  assert.equal(options.skipTaskbar, true);
  assert.equal(options.hasShadow, false);
  assert.equal(options.movable, false);
  assert.deepEqual(options.webPreferences, {
    backgroundThrottling: false,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload: "/workspace/desktop/preload.cjs",
  });
});

test("default shortcuts match the desktop control contract", () => {
  assert.deepEqual(SHORTCUTS, {
    tuck: "Control+F6",
    actionChord: "Control+F7",
    walk: "Control+F8",
    snowball: "Control+F10",
  });
});

test("target selection temporarily accepts Xwayland input", () => {
  assert.deepEqual(overlayInputPolicy(INTERACTION_MODES.INTERACT), {
    focusable: true,
    ignoreMouseEvents: false,
    showInactive: true,
  });
  assert.deepEqual(overlayInputPolicy(INTERACTION_MODES.CLICK_THROUGH), {
    focusable: false,
    ignoreMouseEvents: true,
    showInactive: false,
  });
});

test("GNOME Wayland uses desktop keybindings instead of X11 global grabs", () => {
  assert.equal(shouldUseElectronGlobalShortcuts({
    sessionType: "wayland",
    currentDesktop: "GNOME",
  }), false);
  assert.equal(shouldUseElectronGlobalShortcuts({
    sessionType: "x11",
    currentDesktop: "GNOME",
  }), true);
});
