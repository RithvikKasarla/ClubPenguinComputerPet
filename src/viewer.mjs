import { ACTION_GROUPS, ACTIONS, DEFAULT_ACTION } from "./actions.mjs";
import { createPetRuntime } from "./pet-runtime.mjs?v=20260714-directional-2";
import { createPenguinRenderer } from "./penguin-renderer.mjs";
import { createLatestTargetAttemptGate } from "./target-attempts.mjs";

const list = document.querySelector("#action-list");
const stage = document.querySelector("#stage");
const actor = document.querySelector("#pet-actor");
const effects = document.querySelector("#pet-effects");
const title = document.querySelector("#action-title");
const eyebrow = document.querySelector("#action-eyebrow");
const description = document.querySelector("#action-description");
const layerCount = document.querySelector("#layer-count");
const renderCatalog = await fetch("./generated/render-frames/catalog.json").then((response) => {
  if (!response.ok) throw new Error(`Unable to load render catalog (${response.status})`);
  return response.json();
});
const penguinRenderer = createPenguinRenderer({ host: actor, catalog: renderCatalog });
const targetAttempts = createLatestTargetAttemptGate();
let renderGeneration = 0;

function compositionFor(actionId, direction) {
  const key = direction ? `${actionId}:${direction}` : actionId;
  const composition = renderCatalog.compositions[key];
  if (!composition) throw new RangeError(`Unknown render composition: ${key}`);
  return composition;
}

function updateActionDisplay(actionId, direction) {
  const action = ACTIONS[actionId];
  const composition = compositionFor(actionId, direction);
  title.textContent = action.label;
  eyebrow.textContent = action.eyebrow;
  description.textContent = action.description;
  layerCount.textContent = `${composition.layers.length} ${composition.layers.length === 1 ? "layer" : "layers"}`;
}

async function renderAction(actionId, direction) {
  const action = ACTIONS[actionId];
  if (!action) throw new RangeError(`Unknown action: ${actionId}`);
  const composition = compositionFor(actionId, direction);
  const generation = ++renderGeneration;
  const result = await penguinRenderer.play({ actionId, direction });
  const committed = result.status === "committed" && generation === renderGeneration;

  if (committed) {
    stage.dataset.action = actionId;
    stage.dataset.direction = direction ?? "";
    stage.dataset.layerCount = String(composition.layers.length);
    updateActionDisplay(actionId, direction);
    for (const button of list.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.action === actionId));
    }
    stage.dispatchEvent(new CustomEvent("actionrendered", { detail: { actionId } }));
  }
}

const runtime = createPetRuntime({
  stage,
  actor,
  effects,
  actions: ACTIONS,
  groups: ACTION_GROUPS,
  renderAction,
});
const desktopBridge = window.desktopPet;
const shortcutHint = desktopBridge ? document.createElement("div") : null;
if (shortcutHint) {
  shortcutHint.id = "desktop-shortcut-hint";
  shortcutHint.hidden = true;
  stage.append(shortcutHint);
}
const disposeRuntime = runtime.dispose;
runtime.dispose = () => {
  disposeRuntime();
  penguinRenderer.dispose();
};
penguinRenderer.events.addEventListener("complete", () => {
  const currentAction = runtime.getStatus().action;
  if (ACTIONS[currentAction]?.mode !== "one-shot") return;
  runtime.send({ v: 1, type: "perform", action: DEFAULT_ACTION }).catch(reportError);
});

for (const group of ACTION_GROUPS) {
  const section = document.createElement("section");
  section.className = "action-group";
  section.innerHTML = `<h3>${group.label}</h3>`;
  for (const [actionId, action] of Object.entries(ACTIONS)) {
    if (action.group !== group.id) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = actionId;
    button.setAttribute("aria-pressed", "false");
    const composition = compositionFor(actionId);
    button.innerHTML = `<span>${action.label}</span><small>${String(composition.layers.length).padStart(2, "0")}</small>`;
    button.addEventListener("click", () => {
      runtime.send({ v: 1, type: "perform", action: actionId }).catch(reportError);
    });
    section.append(button);
  }
  list.append(section);
}

function reportError(error) {
  console.error("Unable to render action", error);
  stage.dataset.error = error.message;
}

stage.addEventListener("pointerdown", (event) => {
  const { targeting } = runtime.getStatus();
  if (!targeting || event.button !== 0) return;
  const rectangle = stage.getBoundingClientRect();
  const attempt = targetAttempts.begin();
  const movement = runtime.send({
    v: 1,
    type: targeting,
    target: { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top },
  });
  desktopBridge?.sendEvent("target-selected");
  movement.then((moved) => {
    if (!moved && targetAttempts.isCurrent(attempt)) {
      desktopBridge?.sendEvent("move-failed");
    }
  }).catch((error) => {
    reportError(error);
    if (targetAttempts.isCurrent(attempt)) {
      desktopBridge?.sendEvent("move-failed");
    }
  });
});

runtime.events.addEventListener("targeting", (event) => {
  const selected = event.detail.actionId;
  updateActionDisplay(selected);
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.action === selected));
  }
});

runtime.events.addEventListener("movecomplete", () => {
  desktopBridge?.sendEvent("movecomplete");
});

desktopBridge?.onCommand((command) => {
  targetAttempts.invalidate();
  runtime.send(command).catch(reportError);
});

desktopBridge?.onControl((control) => {
  if (!shortcutHint || control?.type !== "action-chord") return;
  shortcutHint.hidden = !control.armed;
  shortcutHint.textContent = control.armed
    ? `Choose an action: ${control.keys.join(" · ")}`
    : "";
});

runtime.events.addEventListener("positionchange", (event) => {
  desktopBridge?.sendEvent("pet-position", event.detail.position);
});
desktopBridge?.sendEvent("pet-position", runtime.getStatus().position);

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !runtime.getStatus().targeting) return;
  targetAttempts.invalidate();
  runtime.send({ v: 1, type: "stop" }).catch(reportError);
  desktopBridge?.sendEvent("target-cancelled");
});

window.penguinPet = runtime;
runtime.send({ v: 1, type: "perform", action: DEFAULT_ACTION }).catch(reportError);
