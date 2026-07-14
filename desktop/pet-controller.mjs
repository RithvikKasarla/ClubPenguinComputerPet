export const ACTION_CHORDS = Object.freeze({
  J: "jackhammer",
  M: "mop",
  W: "wave",
  D: "dance",
  C: "coffee",
  P: "pizza",
  B: "breakdance",
  G: "guitar",
  H: "hula",
});

export const WORK_ACTIONS = Object.freeze([
  "jackhammer",
  "mop",
  "pizza",
]);

export const MANUAL_ACTION_MS = 4_000;
export const SNOWBALL_ACTION_MS = 2_500;
export const READY_ACTION_MS = 2_500;
export const NEEDS_INPUT_REPEAT_MS = 1_500;
export const WORK_ROTATION_MIN_MS = 10_000;
export const WORK_ROTATION_VARIANCE_MS = 6_000;
export const ROAM_MIN_MS = 7_000;
export const ROAM_VARIANCE_MS = 5_000;

const defaultClock = {
  later: (callback, delay) => setTimeout(callback, delay),
  cancel: (id) => clearTimeout(id),
};

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

export function pointInOverlay(bounds, point) {
  return {
    x: clamp(point.x - bounds.x, 0, bounds.width),
    y: clamp(point.y - bounds.y, 0, bounds.height),
  };
}

export function randomRoamTarget(bounds, random = Math.random) {
  const minimumX = Math.min(85, bounds.width / 2);
  const maximumX = Math.max(minimumX, bounds.width - minimumX);
  const minimumY = Math.min(148, bounds.height);
  const maximumY = Math.max(minimumY, bounds.height - 20);
  return {
    x: Math.round(minimumX + (maximumX - minimumX) * random()),
    y: Math.round(minimumY + (maximumY - minimumY) * random()),
  };
}

export { isPointInPetHitbox } from "../src/pet-geometry.mjs";

export function createDesktopPetController({
  send,
  getBounds,
  getCursorPoint,
  setTargetMode = () => {},
  onStateChange = () => {},
  onError = (error) => console.error("Desktop pet command failed", error),
  workActions = WORK_ACTIONS,
  random = Math.random,
  clock = defaultClock,
} = {}) {
  if (typeof send !== "function") throw new TypeError("send(command) is required");
  if (typeof getBounds !== "function") throw new TypeError("getBounds() is required");
  if (typeof getCursorPoint !== "function") throw new TypeError("getCursorPoint() is required");

  let lifecycle = "idle";
  let roaming = false;
  let suspended = false;
  let targeting = false;
  let targetAction = null;
  let manualOverride = false;
  let manualMovementPending = false;
  let timer = null;
  let previousWorkAction = null;

  function state() {
    return {
      lifecycle,
      roaming,
      suspended,
      targeting,
      targetAction,
      manualOverride,
      manualMovementPending,
    };
  }

  function notify() {
    onStateChange(state());
  }

  function clearTimer() {
    if (timer !== null) clock.cancel(timer);
    timer = null;
  }

  function command(payload) {
    try {
      const result = send(payload);
      if (result && typeof result.catch === "function") result.catch(onError);
    } catch (error) {
      onError(error);
    }
  }

  function schedule(callback, delay) {
    clearTimer();
    timer = clock.later(() => {
      timer = null;
      callback();
    }, delay);
  }

  function chooseWorkAction() {
    if (workActions.length === 0) return "penguin";
    let index = Math.floor(random() * workActions.length);
    let selected = workActions[index] ?? workActions[0];
    if (selected === previousWorkAction && workActions.length > 1) {
      index = (index + 1) % workActions.length;
      selected = workActions[index];
    }
    previousWorkAction = selected;
    return selected;
  }

  function startWorkAction() {
    if (suspended || targeting || manualOverride || lifecycle !== "working") return;
    command({ v: 1, type: "perform", action: chooseWorkAction() });
    schedule(
      startWorkAction,
      WORK_ROTATION_MIN_MS + Math.round(random() * WORK_ROTATION_VARIANCE_MS),
    );
  }

  function startReadyAction() {
    if (suspended || targeting || manualOverride || lifecycle !== "ready") return;
    command({ v: 1, type: "perform", action: "dance" });
    schedule(() => {
      lifecycle = "idle";
      notify();
      resumeBase();
    }, READY_ACTION_MS);
  }

  function startNeedsInputAction() {
    if (suspended || targeting || manualOverride || lifecycle !== "needs_input") return;
    command({ v: 1, type: "perform", action: "wave" });
    schedule(startNeedsInputAction, NEEDS_INPUT_REPEAT_MS);
  }

  function startRoam() {
    if (suspended || targeting || manualOverride || lifecycle !== "idle" || !roaming) return;
    const bounds = getBounds();
    command({
      v: 1,
      type: "moveTo",
      target: randomRoamTarget({ width: bounds.width, height: bounds.height }, random),
    });
    schedule(
      startRoam,
      ROAM_MIN_MS + Math.round(random() * ROAM_VARIANCE_MS),
    );
  }

  function resumeBase() {
    clearTimer();
    if (suspended || targeting || manualOverride) return;
    if (lifecycle === "working") {
      startWorkAction();
    } else if (lifecycle === "needs_input") {
      startNeedsInputAction();
    } else if (lifecycle === "ready") {
      startReadyAction();
    } else if (lifecycle === "idle" && roaming) {
      startRoam();
    } else if (lifecycle === "idle") {
      command({ v: 1, type: "perform", action: "penguin" });
    }
  }

  function setLifecycle(nextLifecycle) {
    if (nextLifecycle === "working") {
      const wasWorking = lifecycle === "working";
      lifecycle = "working";
      if (!wasWorking && !manualOverride && !targeting) {
        clearTimer();
        startWorkAction();
      }
    } else if (nextLifecycle === "needs_input") {
      clearTimer();
      manualOverride = false;
      manualMovementPending = false;
      targeting = false;
      targetAction = null;
      setTargetMode(false);
      lifecycle = "needs_input";
      if (!suspended) startNeedsInputAction();
    } else if (nextLifecycle === "stopped" || nextLifecycle === "ready") {
      clearTimer();
      manualOverride = false;
      manualMovementPending = false;
      targeting = false;
      targetAction = null;
      setTargetMode(false);
      lifecycle = "ready";
      startReadyAction();
    } else if (nextLifecycle === "idle") {
      clearTimer();
      manualOverride = false;
      manualMovementPending = false;
      if (targeting) {
        targeting = false;
        targetAction = null;
        setTargetMode(false);
      }
      lifecycle = "idle";
      resumeBase();
    } else {
      throw new RangeError(`Unknown desktop pet lifecycle: ${nextLifecycle}`);
    }
    notify();
    return state();
  }

  function leaveTargetMode() {
    if (!targeting) return;
    targeting = false;
    targetAction = null;
    setTargetMode(false);
  }

  function perform(action) {
    if (suspended) return;
    clearTimer();
    leaveTargetMode();
    manualMovementPending = false;
    targetAction = null;
    manualOverride = true;
    command({ v: 1, type: "perform", action });
    schedule(() => {
      manualOverride = false;
      resumeBase();
      notify();
    }, MANUAL_ACTION_MS);
    notify();
  }

  function throwAtCursor() {
    if (suspended) return;
    clearTimer();
    leaveTargetMode();
    manualMovementPending = false;
    manualOverride = true;
    command({
      v: 1,
      type: "throwSnowball",
      target: pointInOverlay(getBounds(), getCursorPoint()),
    });
    schedule(() => {
      manualOverride = false;
      resumeBase();
      notify();
    }, SNOWBALL_ACTION_MS);
    notify();
  }

  function armTarget(action) {
    if (suspended) return;
    clearTimer();
    manualOverride = true;
    manualMovementPending = false;
    targeting = true;
    targetAction = action;
    setTargetMode(true);
    command({ v: 1, type: "perform", action });
    notify();
  }

  function armWalkTarget() {
    armTarget("walk");
  }

  function armSnowballTarget() {
    armTarget("snowball");
  }

  function targetSelected() {
    if (!targeting) return;
    const selectedAction = targetAction;
    targeting = false;
    targetAction = null;
    manualMovementPending = selectedAction === "walk";
    setTargetMode(false);
    if (selectedAction === "snowball") {
      schedule(() => {
        manualOverride = false;
        resumeBase();
        notify();
      }, SNOWBALL_ACTION_MS);
    }
    notify();
  }

  function movementComplete() {
    if (targeting) targetSelected();
    if (!manualMovementPending) {
      notify();
      return;
    }
    manualMovementPending = false;
    manualOverride = false;
    resumeBase();
    notify();
  }

  function movementFailed() {
    if (!manualMovementPending) return;
    manualMovementPending = false;
    manualOverride = false;
    resumeBase();
    notify();
  }

  function cancelTarget() {
    if (!targeting) return;
    targeting = false;
    targetAction = null;
    manualMovementPending = false;
    manualOverride = false;
    setTargetMode(false);
    command({ v: 1, type: "stop" });
    resumeBase();
    notify();
  }

  function setRoaming(enabled) {
    roaming = Boolean(enabled);
    if (roaming) {
      if (lifecycle === "idle" && !suspended && !targeting) startRoam();
    } else if (lifecycle === "idle" && !manualOverride && !targeting) {
      clearTimer();
      command({ v: 1, type: "perform", action: "penguin" });
    }
    notify();
    return roaming;
  }

  function setSuspended(enabled) {
    suspended = Boolean(enabled);
    if (suspended) {
      clearTimer();
      manualOverride = false;
      manualMovementPending = false;
      if (targeting) {
        targeting = false;
        targetAction = null;
        setTargetMode(false);
      }
    } else {
      resumeBase();
    }
    notify();
  }

  function destroy() {
    clearTimer();
    if (targeting) setTargetMode(false);
  }

  return {
    armSnowballTarget,
    armWalkTarget,
    cancelTarget,
    destroy,
    getState: state,
    movementComplete,
    movementFailed,
    perform,
    setLifecycle,
    setRoaming,
    setSuspended,
    targetSelected,
    throwAtCursor,
    toggleRoaming: () => setRoaming(!roaming),
  };
}
