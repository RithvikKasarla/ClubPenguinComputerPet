const { ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    ipcRenderer.send("desktop-pet-input", { type: "primary-click" });
  });
  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    ipcRenderer.send("desktop-pet-input", { type: "context-menu" });
  });
});
