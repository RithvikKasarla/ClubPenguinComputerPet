const { contextBridge, ipcRenderer } = require("electron");

const EVENT_TYPES = new Set([
  "target-selected",
  "target-cancelled",
  "movecomplete",
  "move-failed",
  "pet-position",
]);

function subscribe(channel, callback) {
  if (typeof callback !== "function") throw new TypeError("A callback is required");
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("desktopPet", {
  onCommand: (callback) => subscribe("desktop-pet-command", callback),
  onControl: (callback) => subscribe("desktop-pet-control", callback),
  sendEvent(type, detail = null) {
    if (!EVENT_TYPES.has(type)) throw new RangeError(`Unsupported desktop pet event: ${type}`);
    ipcRenderer.send("desktop-pet-event", { type, detail });
  },
});
