import {
  clampActorPosition,
  createWalkPlan,
  pointOnSnowballArc,
  pointOnWalk,
  directionToPoint,
  throwDirectionToPoint,
  SNOWBALL_DWELL_MS,
} from "./pet-motion.mjs?v=20260714-directional";

// Generated frames keep the original local registration point. This is the
// penguin's visible footprint, not the larger transparent capture canvas.
const ACTOR_SIZE = Object.freeze({ width: 150, height: 128 });

const defaultClock = {
  now: () => performance.now(),
  frame: (callback) => setTimeout(() => callback(performance.now()), 16),
  cancelFrame: (id) => clearTimeout(id),
  later: (callback, delay) => setTimeout(callback, delay),
  cancelLater: (id) => clearTimeout(id),
};

function targetFrom(command) {
  const target = command.target ?? command;
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
    throw new TypeError("A finite target { x, y } is required");
  }
  return { x: target.x, y: target.y };
}

export function createPetRuntime({
  stage,
  actor,
  effects,
  actions,
  groups,
  renderAction,
  clock = defaultClock,
}) {
  const events = new EventTarget();
  let position = { x: stage.clientWidth / 2, y: stage.clientHeight - 22 };
  let actionId = "penguin";
  let targeting = null;
  let runId = 0;
  let frameId = null;
  let actionTimer = null;
  const activeEffects = new Set();

  function bounds() {
    return { width: stage.clientWidth, height: stage.clientHeight };
  }

  function applyPosition(next) {
    position = clampActorPosition(next, bounds(), ACTOR_SIZE, 10);
    actor.style.left = `${position.x}px`;
    actor.style.top = `${position.y}px`;
    emit("positionchange");
  }

  function emit(type, detail = {}) {
    events.dispatchEvent(new CustomEvent(type, { detail: { ...detail, ...status() } }));
  }

  function reportError(error) {
    emit("error", { message: error instanceof Error ? error.message : String(error) });
  }

  function cancelActorWork() {
    runId += 1;
    if (frameId !== null) clock.cancelFrame(frameId);
    if (actionTimer !== null) clock.cancelLater(actionTimer);
    frameId = null;
    actionTimer = null;
  }

  function cancelEffects() {
    for (const effect of activeEffects) {
      if (effect.frameId !== null) clock.cancelFrame(effect.frameId);
      if (effect.timerId !== null) clock.cancelLater(effect.timerId);
      effect.node.remove();
    }
    activeEffects.clear();
  }

  async function show(nextActionId, token = runId, direction) {
    if (!actions[nextActionId]) throw new RangeError(`Unknown pet action: ${nextActionId}`);
    targeting = null;
    stage.dataset.targeting = "";
    if (direction) actor.dataset.facing = direction;
    await renderAction(nextActionId, direction);
    if (token !== runId) return false;
    actionId = nextActionId;
    emit("actionchange", { actionId: nextActionId });
    return true;
  }

  async function perform(nextActionId) {
    const action = actions[nextActionId];
    if (!action) throw new RangeError(`Unknown pet action: ${nextActionId}`);
    cancelActorWork();
    const token = runId;

    if (action.target === "playground-point") {
      targeting = nextActionId === "walk" ? "moveTo" : "throwSnowball";
      actionId = nextActionId;
      stage.dataset.targeting = targeting;
      emit("targeting", { actionId: nextActionId, targeting });
      return;
    }

    const defaultDirection = nextActionId === "penguin" ? "down" : undefined;
    if (!(await show(nextActionId, token, defaultDirection))) return false;
    return true;
  }

  async function moveTo(rawTarget) {
    cancelActorWork();
    const token = runId;
    const target = clampActorPosition(rawTarget, bounds(), ACTOR_SIZE, 10);
    const plan = createWalkPlan(position, target);
    if (!(await show("walk", token, plan.facing))) return false;
    const startedAt = clock.now();

    return new Promise((resolve) => {
      function tick(now) {
        if (token !== runId) return resolve(false);
        const progress = Math.min(1, (now - startedAt) / plan.durationMs);
        applyPosition(pointOnWalk(plan, progress));
        if (progress < 1) {
          frameId = clock.frame(tick);
          return;
        }
        frameId = null;
        show("penguin", token, plan.facing).then((shown) => {
          if (shown) emit("movecomplete", { target });
          resolve(shown);
        }).catch((error) => {
          reportError(error);
          resolve(false);
        });
      }
      frameId = clock.frame(tick);
    });
  }

  async function throwSnowball(rawTarget) {
    cancelActorWork();
    const token = runId;
    const target = clampActorPosition(rawTarget, bounds(), { width: 18, height: 18 }, 4);
    const facing = directionToPoint(position, target);
    const throwFacing = throwDirectionToPoint(position, target);
    if (!(await show("snowball", token, throwFacing))) return false;

    actionTimer = clock.later(() => {
      if (token !== runId) return;
      actionTimer = null;
      const delta = { x: target.x - position.x, y: target.y - position.y };
      const magnitude = Math.hypot(delta.x, delta.y) || 1;
      const unit = { x: delta.x / magnitude, y: delta.y / magnitude };
      const start = {
        x: position.x + unit.x * 28,
        y: position.y - 118 + unit.y * 12,
      };
      const distance = Math.hypot(target.x - start.x, target.y - start.y);
      const durationMs = Math.max(420, Math.min(1100, distance / 0.8));
      const arcHeight = Math.max(55, Math.min(180, distance * 0.32));
      const snowball = document.createElement("div");
      snowball.className = "snowball";
      effects.append(snowball);
      const effect = { node: snowball, frameId: null, timerId: null };
      activeEffects.add(effect);
      const launchedAt = clock.now();

      function fly(now) {
        const progress = Math.min(1, (now - launchedAt) / durationMs);
        const point = pointOnSnowballArc(start, target, progress, arcHeight);
        snowball.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
        if (progress < 1) {
          effect.frameId = clock.frame(fly);
          return;
        }

        effect.frameId = null;
        snowball.classList.add("is-landed");
        emit("snowballlanded", { target });
        effect.timerId = clock.later(() => {
          snowball.remove();
          activeEffects.delete(effect);
        }, SNOWBALL_DWELL_MS);
      }

      effect.frameId = clock.frame(fly);
      actionTimer = clock.later(() => {
        if (token !== runId) return;
        actionTimer = null;
        show("penguin", token, facing).catch(reportError);
      }, 380);
    }, 800);
    return true;
  }

  async function send(command) {
    if (!command || typeof command !== "object") throw new TypeError("Pet command must be an object");
    if (command.v !== undefined && command.v !== 1) throw new RangeError("Unsupported pet command version");
    switch (command.type) {
      case "perform": return perform(command.action);
      case "moveTo": return moveTo(targetFrom(command));
      case "throwSnowball": return throwSnowball(targetFrom(command));
      case "stop": cancelActorWork(); cancelEffects(); return show("penguin", runId);
      default: throw new RangeError(`Unknown pet command type: ${command.type}`);
    }
  }

  function status() {
    return { action: actionId, position: { ...position }, targeting };
  }

  function getCatalog() {
    return {
      groups: Object.values(groups).map(({ id, label, description }) => ({ id, label, description })),
      actions: Object.entries(actions).map(([id, action]) => ({
        id,
        label: action.label,
        group: action.group,
        tags: [...action.tags],
        target: action.target ?? null,
      })),
    };
  }

  applyPosition(position);
  const resizeObserver = new ResizeObserver(() => applyPosition(position));
  resizeObserver.observe(stage);

  function dispose() {
    cancelActorWork();
    cancelEffects();
    resizeObserver.disconnect();
  }

  return { version: "1.0", events, send, getCatalog, getStatus: status, dispose };
}
