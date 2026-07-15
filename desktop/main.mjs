import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} from "electron";

import { createActionChordController } from "./action-chord.mjs";
import {
  createOverlayWindowOptions,
  INTERACTION_MODES,
  overlayInputPolicy,
  overlayBoundsForWorkArea,
  SHORTCUTS,
  shouldUseElectronGlobalShortcuts,
} from "./config.mjs";
import { createDesktopControlServer } from "./control-socket.mjs";
import { createCodexHookServer } from "./hook-server.mjs";
import { createHookLifecycleAggregator } from "./codex-hook-events.mjs";
import {
  ACTION_CHORDS,
  createDesktopPetController,
} from "./pet-controller.mjs";
import {
  createPetInputWindowOptions,
  initialPetInputBounds,
  petInputBounds,
} from "./pet-input-window.mjs";
import { uniformActorMenuItems } from "./pet-menu-policy.mjs";
import { ACTION_GROUPS, ACTIONS } from "../src/actions.mjs";

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(desktopDirectory, "..");
const viewerPath = path.join(projectDirectory, "index.html");
const preloadPath = path.join(desktopDirectory, "preload.cjs");
const inputPreloadPath = path.join(desktopDirectory, "input-preload.cjs");
const inputHtmlPath = path.join(desktopDirectory, "input.html");
const overlayStylesPath = path.join(desktopDirectory, "overlay.css");
const trayIconPath = path.join(
  projectDirectory,
  "generated",
  "render-frames",
  "penguin",
  "00-idle",
  "0.png",
);

let overlayWindow = null;
let petInputWindow = null;
let tray = null;
let trayMenu = null;
let hookServer = null;
let controlServer = null;
let hookLifecycleAggregator = null;
let petController = null;
let actionChord = null;
let interactionMode = INTERACTION_MODES.CLICK_THROUGH;
let tucked = false;
let petPosition = null;

function isInteractive() {
  return interactionMode === INTERACTION_MODES.INTERACT;
}

function applyInteractionMode() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  const interactive = isInteractive();
  const inputPolicy = overlayInputPolicy(interactionMode);
  overlayWindow.setIgnoreMouseEvents(inputPolicy.ignoreMouseEvents);
  overlayWindow.setFocusable(inputPolicy.focusable);
  if (petInputWindow && !petInputWindow.isDestroyed()) {
    if (interactive || tucked || !petPosition || !petController) {
      petInputWindow.hide();
    } else {
      updatePetInputWindow();
      petInputWindow.showInactive();
    }
  }

  if (inputPolicy.showInactive && !tucked) {
    overlayWindow.showInactive();
  } else {
    overlayWindow.blur();
  }
  rebuildMenus();
}

function updatePetInputWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()
    || !petInputWindow || petInputWindow.isDestroyed()
    || !petPosition) return;
  petInputWindow.setBounds(
    petInputBounds(overlayWindow.getBounds(), petPosition),
    false,
  );
}

function setInteractionMode(nextMode) {
  interactionMode = nextMode;
  applyInteractionMode();
}

function sendRendererControl(payload) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send("desktop-pet-control", payload);
}

function createRendererPet() {
  return {
    send(command) {
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        return Promise.reject(new Error("The penguin overlay is not available"));
      }
      overlayWindow.webContents.send("desktop-pet-command", command);
      return Promise.resolve();
    },
  };
}

function wakePet() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  tucked = false;
  overlayWindow.showInactive();
  setInteractionMode(INTERACTION_MODES.CLICK_THROUGH);
  petController?.setSuspended(false);
  rebuildMenus();
}

function tuckPet() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  actionChord?.disarm();
  tucked = true;
  setInteractionMode(INTERACTION_MODES.CLICK_THROUGH);
  petController?.setSuspended(true);
  overlayWindow.hide();
  petInputWindow?.hide();
  rebuildMenus();
}

function toggleTucked() {
  if (tucked) wakePet();
  else tuckPet();
}

function actionsMenuItems() {
  const shortcutByAction = new Map(
    Object.entries(ACTION_CHORDS).map(([key, action]) => [action, key]),
  );
  return ACTION_GROUPS.map((group) => ({
    label: group.label,
    submenu: Object.entries(ACTIONS)
      .filter(([, action]) => action.group === group.id && action.target === "none")
      .map(([actionId, action]) => ({
        label: shortcutByAction.has(actionId)
          ? `${action.label}  ·  ${shortcutByAction.get(actionId)}`
          : action.label,
        click: () => petController?.perform(actionId),
      })),
  })).filter((group) => group.submenu.length > 0);
}

function petMenuItems() {
  const controllerState = petController?.getState();
  return [
    {
      label: tucked ? `Wake Penguin  ·  ${SHORTCUTS.tuck}` : `Tuck Away  ·  ${SHORTCUTS.tuck}`,
      click: toggleTucked,
    },
    { type: "separator" },
    {
      label: "Roaming",
      type: "checkbox",
      checked: controllerState?.roaming ?? false,
      click: () => petController?.toggleRoaming(),
    },
    {
      label: `Walk Somewhere  ·  ${SHORTCUTS.walk}`,
      enabled: !tucked,
      click: () => petController?.armWalkTarget(),
    },
    {
      label: "Throw Snowball Somewhere  ·  choose next click",
      enabled: !tucked,
      click: () => petController?.armSnowballTarget(),
    },
    {
      label: `Actions  ·  ${SHORTCUTS.actionChord} then key`,
      enabled: !tucked,
      submenu: actionsMenuItems(),
    },
    { type: "separator" },
    { id: "quit", label: "Quit Penguin", click: () => app.quit() },
  ];
}

function rebuildMenus() {
  if (tray) {
    trayMenu = Menu.buildFromTemplate(petMenuItems());
    tray.setContextMenu(trayMenu);
    const status = tucked
      ? `Tucked away · wake with ${SHORTCUTS.tuck}`
      : petController?.getState().lifecycle ?? "idle";
    tray.setToolTip(`Club Penguin Pet · ${status}`);
  }
}

function showPetContextMenu() {
  if (!tucked) {
    trayMenu = Menu.buildFromTemplate(uniformActorMenuItems(petMenuItems()));
    trayMenu.popup({ window: petInputWindow ?? overlayWindow });
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(trayIconPath).resize({ width: 22, height: 22 });
  tray = new Tray(icon);
  tray.on("click", toggleTucked);
  rebuildMenus();
}

async function createOverlayWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  overlayWindow = new BrowserWindow(
    createOverlayWindowOptions(overlayBoundsForWorkArea(workArea), preloadPath),
  );

  overlayWindow.setAlwaysOnTop(true, "floating");
  overlayWindow.setVisibleOnAllWorkspaces(true);
  overlayWindow.setSkipTaskbar(true);
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
  overlayWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  overlayWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  await overlayWindow.loadFile(viewerPath);
  const overlayStyles = await readFile(overlayStylesPath, "utf8");
  await overlayWindow.webContents.insertCSS(overlayStyles);
  applyInteractionMode();
  overlayWindow.showInactive();
}

async function createPetInputWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  petInputWindow = new BrowserWindow(createPetInputWindowOptions(
    initialPetInputBounds(workArea),
    inputPreloadPath,
  ));
  petInputWindow.setAlwaysOnTop(true, "floating");
  petInputWindow.setVisibleOnAllWorkspaces(true);
  petInputWindow.setSkipTaskbar(true);
  petInputWindow.on("closed", () => {
    petInputWindow = null;
  });
  petInputWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  petInputWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  await petInputWindow.loadFile(inputHtmlPath);
}

function registerShortcut(accelerator, callback) {
  const registered = globalShortcut.register(accelerator, callback);
  if (!registered) {
    console.warn(`Unable to register ${accelerator}; use the tray menu or configure another key.`);
  }
  return registered;
}

function registerDesktopShortcuts() {
  registerShortcut(SHORTCUTS.tuck, toggleTucked);
  registerShortcut(SHORTCUTS.actionChord, () => {
    if (!tucked) actionChord?.arm();
  });
  registerShortcut(SHORTCUTS.walk, () => {
    if (!tucked) petController?.armWalkTarget();
  });
  registerShortcut(SHORTCUTS.snowball, () => {
    if (!tucked) petController?.armSnowballTarget();
  });
}

function handleDesktopControl({ action }) {
  switch (action) {
    case "toggle-tuck":
      toggleTucked();
      break;
    case "show-menu":
      if (!tucked) showPetContextMenu();
      break;
    case "target-walk":
      if (!tucked) petController?.armWalkTarget();
      break;
    case "target-snowball":
      if (!tucked) petController?.armSnowballTarget();
      break;
    default:
      break;
  }
}

function handleRendererEvent(event, payload) {
  if (!overlayWindow || event.sender !== overlayWindow.webContents) return;
  switch (payload?.type) {
    case "target-selected":
      petController?.targetSelected();
      setInteractionMode(INTERACTION_MODES.CLICK_THROUGH);
      break;
    case "target-cancelled":
      petController?.cancelTarget();
      setInteractionMode(INTERACTION_MODES.CLICK_THROUGH);
      break;
    case "movecomplete":
      petController?.movementComplete();
      break;
    case "move-failed":
      petController?.movementFailed();
      break;
    case "pet-position":
      if (Number.isFinite(payload.detail?.x) && Number.isFinite(payload.detail?.y)) {
        petPosition = { x: payload.detail.x, y: payload.detail.y };
        if (!tucked && !isInteractive()) updatePetInputWindow();
      }
      break;
    default:
      break;
  }
}

ipcMain.on("desktop-pet-event", handleRendererEvent);

ipcMain.on("desktop-pet-input", (event, payload) => {
  if (!petInputWindow || event.sender !== petInputWindow.webContents || tucked) return;
  if (payload?.type === "primary-click") {
    petController?.armWalkTarget();
  } else if (payload?.type === "context-menu") {
    showPetContextMenu();
  }
});

const ownsSingleInstance = app.requestSingleInstanceLock();

if (!ownsSingleInstance) {
  app.quit();
} else {
  app.on("second-instance", wakePet);

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await createOverlayWindow();
    await createPetInputWindow();

    petController = createDesktopPetController({
      send: (command) => createRendererPet().send(command),
      getBounds: () => overlayWindow.getBounds(),
      getCursorPoint: () => screen.getCursorScreenPoint(),
      setTargetMode(enabled) {
        if (enabled) {
          wakePet();
          setInteractionMode(INTERACTION_MODES.INTERACT);
        } else if (!tucked) {
          setInteractionMode(INTERACTION_MODES.CLICK_THROUGH);
        }
      },
      onStateChange: rebuildMenus,
    });

    actionChord = createActionChordController({
      mapping: ACTION_CHORDS,
      register: registerShortcut,
      unregister: (accelerator) => globalShortcut.unregister(accelerator),
      onAction: (action) => petController.perform(action),
      onChange: (armed, keys) => sendRendererControl({
        type: "action-chord",
        armed,
        keys,
      }),
    });

    hookLifecycleAggregator = createHookLifecycleAggregator({
      onLifecycleChange: (lifecycle) => petController.setLifecycle(lifecycle),
    });
    hookServer = await createCodexHookServer({
      onLifecycle: (event) => petController.setLifecycle(hookLifecycleAggregator(event)),
    }).catch((error) => {
      console.error("Unable to start the Codex lifecycle hook bridge", error);
      return null;
    });
    controlServer = await createDesktopControlServer({
      onControl: handleDesktopControl,
    }).catch((error) => {
      console.error("Unable to start the desktop shortcut control bridge", error);
      return null;
    });

    createTray();
    if (shouldUseElectronGlobalShortcuts()) {
      registerDesktopShortcuts();
    } else {
      console.info("GNOME Wayland detected; using desktop custom keybindings for shortcuts.");
    }
    updatePetInputWindow();
    applyInteractionMode();
    rebuildMenus();
  }).catch((error) => {
    console.error("Unable to start the Club Penguin desktop overlay", error);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  actionChord?.dispose();
  petController?.destroy();
  hookLifecycleAggregator?.dispose();
  globalShortcut.unregisterAll();
  hookServer?.close().catch((error) => {
    console.error("Unable to close the Codex hook bridge", error);
  });
  controlServer?.close().catch((error) => {
    console.error("Unable to close the desktop shortcut control bridge", error);
  });
});
