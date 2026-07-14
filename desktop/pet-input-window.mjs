import { PET_HITBOX } from "../src/pet-geometry.mjs";

const inputSize = () => ({
  width: PET_HITBOX.halfWidth * 2,
  height: PET_HITBOX.top + PET_HITBOX.bottom,
});

export function initialPetInputBounds(workArea) {
  return { x: workArea.x, y: workArea.y, ...inputSize() };
}

export function petInputBounds(overlayBounds, position) {
  return {
    x: Math.round(overlayBounds.x + position.x - PET_HITBOX.halfWidth),
    y: Math.round(overlayBounds.y + position.y - PET_HITBOX.top),
    ...inputSize(),
  };
}

export function createPetInputWindowOptions(bounds, preload) {
  return {
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#01000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload,
    },
  };
}
