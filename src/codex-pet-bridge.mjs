import { createCodexExecJsonlAdapter } from "./codex-exec-jsonl.mjs";
import { createPetState, reducePetState } from "./codex-pet-state.mjs";

export const DEFAULT_ACTION_BY_MODE = Object.freeze({
  idle: "penguin",
  running: "jackhammer",
  needs_input: "wave",
  ready: "dance",
  blocked: "penguin",
});

export function createCodexPetBridge({
  pet,
  initialState = createPetState(),
  actionByMode = DEFAULT_ACTION_BY_MODE,
  onStateChange = () => {},
} = {}) {
  if (!pet || typeof pet.send !== "function") {
    throw new TypeError("A pet with a send(command) method is required");
  }

  let state = initialState;
  let commandQueue = Promise.resolve();

  function handle(event) {
    const previousMode = state.mode;
    state = reducePetState(state, event);
    const stateAfterEvent = state;
    onStateChange(stateAfterEvent, event);

    if (stateAfterEvent.mode === previousMode) {
      return Promise.resolve(stateAfterEvent);
    }

    const action = actionByMode[stateAfterEvent.mode];
    if (typeof action !== "string" || action.length === 0) {
      return Promise.reject(new RangeError(`No pet action configured for ${stateAfterEvent.mode}`));
    }

    const operation = commandQueue
      .catch(() => {})
      .then(() => pet.send({ v: 1, type: "perform", action }));
    commandQueue = operation;
    return operation.then(() => stateAfterEvent);
  }

  function acknowledge(threadId, at = Date.now()) {
    return handle({ type: "thread.acknowledged", threadId, at });
  }

  return {
    handle,
    acknowledge,
    getState: () => state,
    whenIdle: () => commandQueue,
  };
}

export function createCodexExecPetBridge({ now, ...bridgeOptions } = {}) {
  const adapter = createCodexExecJsonlAdapter({ now });
  const bridge = createCodexPetBridge(bridgeOptions);

  async function write(chunk) {
    for (const event of adapter.write(chunk)) await bridge.handle(event);
    return bridge.getState();
  }

  async function end() {
    for (const event of adapter.end()) await bridge.handle(event);
    return bridge.getState();
  }

  return { ...bridge, write, end };
}
