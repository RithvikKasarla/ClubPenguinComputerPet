export const SNOWBALL_DWELL_MS = 1_500;
export const WALK_SPEED_PX_PER_SECOND = 215;

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

const lerp = (start, end, progress) => start + (end - start) * progress;

export const DIRECTIONS = Object.freeze([
  "down",
  "down-left",
  "left",
  "up-left",
  "up",
  "up-right",
  "right",
  "down-right",
]);

export const THROW_DIRECTIONS = Object.freeze([
  "down-left",
  "up-left",
  "up-right",
  "down-right",
]);

function angleFromPoints(start, end) {
  const degrees = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI) - 90;
  return degrees < 0 ? degrees + 360 : degrees;
}

export function directionToPoint(start, end) {
  const index = Math.round(angleFromPoints(start, end) / 45);
  return DIRECTIONS[index > 7 ? 0 : index];
}

export function throwDirectionToPoint(start, end) {
  const index = Math.floor(angleFromPoints(start, end) / 90);
  return THROW_DIRECTIONS[index > 3 ? 0 : index];
}

export function clampActorPosition(point, bounds, actor, padding = 0) {
  const halfWidth = actor.width / 2;
  return {
    x: clamp(point.x, padding + halfWidth, bounds.width - padding - halfWidth),
    y: clamp(point.y, padding + actor.height, bounds.height - padding),
  };
}

export function createWalkPlan(start, end, speed = WALK_SPEED_PX_PER_SECOND) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  return {
    start: { ...start },
    end: { ...end },
    distance,
    durationMs: clamp((distance / speed) * 1_000, 500, 5_000),
    facing: directionToPoint(start, end),
  };
}

export function pointOnWalk(plan, progress) {
  const boundedProgress = clamp(progress, 0, 1);
  return {
    x: lerp(plan.start.x, plan.end.x, boundedProgress),
    y: lerp(plan.start.y, plan.end.y, boundedProgress),
  };
}

export function pointOnSnowballArc(start, target, progress, arcHeight = 110) {
  const boundedProgress = clamp(progress, 0, 1);
  const lift = 4 * arcHeight * boundedProgress * (1 - boundedProgress);
  return {
    x: lerp(start.x, target.x, boundedProgress),
    y: lerp(start.y, target.y, boundedProgress) - lift,
  };
}
