export const INTERACTION_MODES = Object.freeze({
  CLICK_THROUGH: "click-through",
  INTERACT: "interact",
});

export const SHORTCUTS = Object.freeze({
  tuck: "Control+F6",
  actionChord: "Control+F7",
  walk: "Control+F8",
  snowball: "Control+F10",
});

export function overlayInputPolicy(mode) {
  const interactive = mode === INTERACTION_MODES.INTERACT;
  return {
    focusable: interactive,
    ignoreMouseEvents: !interactive,
    showInactive: interactive,
  };
}

export function shouldUseElectronGlobalShortcuts({
  sessionType = process.env.XDG_SESSION_TYPE,
  currentDesktop = process.env.XDG_CURRENT_DESKTOP,
} = {}) {
  return !(
    String(sessionType).toLowerCase() === "wayland"
    && String(currentDesktop).toUpperCase().includes("GNOME")
  );
}

export function overlayBoundsForWorkArea(workArea) {
  return {
    x: workArea.x,
    y: workArea.y,
    width: Math.max(1, workArea.width),
    height: Math.max(1, workArea.height),
  };
}

export function createOverlayWindowOptions(bounds, preload) {
  return {
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    // Start focus-capable while hidden so X11 creates a window that can accept
    // temporary target clicks. Main disables focus before the first show.
    focusable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload,
    },
  };
}
