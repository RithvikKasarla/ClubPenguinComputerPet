import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SNOWBALL_DWELL_MS,
  clampActorPosition,
  createWalkPlan,
  directionToPoint,
  pointOnSnowballArc,
  throwDirectionToPoint,
} from "../src/pet-motion.mjs";

test("walking stays fully inside the playground", () => {
  const bounds = { width: 800, height: 500 };
  const actor = { width: 180, height: 210 };

  assert.deepEqual(clampActorPosition({ x: -50, y: -50 }, bounds, actor), {
    x: 90,
    y: 210,
  });
  assert.deepEqual(clampActorPosition({ x: 900, y: 900 }, bounds, actor), {
    x: 710,
    y: 500,
  });
});

test("walk plans expose direction and distance-based duration", () => {
  const plan = createWalkPlan({ x: 100, y: 300 }, { x: 500, y: 300 });
  assert.equal(plan.facing, "right");
  assert.equal(plan.distance, 400);
  assert.ok(plan.durationMs >= 1_000);
});

test("cursor positions select the eight authored waddle directions", () => {
  const center = { x: 100, y: 100 };
  assert.equal(directionToPoint(center, { x: 100, y: 200 }), "down");
  assert.equal(directionToPoint(center, { x: 0, y: 200 }), "down-left");
  assert.equal(directionToPoint(center, { x: 0, y: 100 }), "left");
  assert.equal(directionToPoint(center, { x: 0, y: 0 }), "up-left");
  assert.equal(directionToPoint(center, { x: 100, y: 0 }), "up");
  assert.equal(directionToPoint(center, { x: 200, y: 0 }), "up-right");
  assert.equal(directionToPoint(center, { x: 200, y: 100 }), "right");
  assert.equal(directionToPoint(center, { x: 200, y: 200 }), "down-right");
});

test("snowball throws use Club Penguin's four authored quadrants", () => {
  const center = { x: 100, y: 100 };
  assert.equal(throwDirectionToPoint(center, { x: 0, y: 200 }), "down-left");
  assert.equal(throwDirectionToPoint(center, { x: 0, y: 0 }), "up-left");
  assert.equal(throwDirectionToPoint(center, { x: 200, y: 0 }), "up-right");
  assert.equal(throwDirectionToPoint(center, { x: 200, y: 200 }), "down-right");
});

test("a snowball arcs to the exact cursor target and dwells for 1.5 seconds", () => {
  const start = { x: 100, y: 300 };
  const target = { x: 500, y: 350 };

  assert.deepEqual(pointOnSnowballArc(start, target, 0), start);
  assert.deepEqual(pointOnSnowballArc(start, target, 1), target);
  assert.ok(pointOnSnowballArc(start, target, 0.5).y < 325);
  assert.equal(SNOWBALL_DWELL_MS, 1_500);
});
