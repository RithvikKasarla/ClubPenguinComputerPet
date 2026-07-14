import { ACTIONS } from "../src/actions.mjs";

export const RENDER_VIEWPORT = Object.freeze({ width: 160, height: 180 });
export const RENDER_CAPTURE_SCALE = 3;
export const RENDER_FPS = 24;
export const EXPANDED_STAGE_BOUNDS = Object.freeze({
  xmin: -70 * 20,
  xmax: 90 * 20,
  ymin: -85 * 20,
  ymax: 95 * 20,
});

export const ACTION_FRAME_COUNTS = Object.freeze({
  penguin: 1,
  walk: 8,
  wave: 29,
  dance: 193,
  breakdance: 44,
  hula: 56,
  maracas: 28,
  guitar: 12,
  jackhammer: 33,
  pizza: 20,
  mop: 45,
  coffee: 25,
  snowball: 28,
  propeller: 21,
  swim: 12,
});

// Project Flipper reconstructs the classic wave from the 12 authored source
// poses instead of playing a linear 29-frame strip.
const SOURCE_SEQUENCES = Object.freeze({
  wave: Object.freeze([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    4, 5, 6, 7, 8, 9, 10, 11,
    4, 5, 6, 7, 8, 9, 10, 11,
    0,
  ]),
});

const PLAYBACK_BY_ACTION = Object.freeze({
  wave: "once",
  snowball: "once",
  coffee: "once",
});

const LOOP_START_BY_ACTION = Object.freeze({
  jackhammer: 16,
  mop: 12,
});

const buildAsset = ({ input, output, frame, role = "penguin", depth = 0, itemId, slot }) =>
  Object.freeze({ input, output, frame, role, depth, itemId, slot });

const penguinAsset = (output, frame) => buildAsset({
  input: "assets/penguin.swf",
  output,
  frame,
});

const actionAsset = (actionId) => buildAsset({
  input: `assets/actions/${actionId}.swf`,
  output: `${actionId}.swf`,
  // Every local action movie places its animated tracks on root frame 2.
  frame: 2,
});

const DEPTH_BY_SLOT = Object.freeze({ body: 220, hand: 240, head: 260 });
const clothingAsset = (itemId, frame, slot) => buildAsset({
  input: `assets/clothing/sprites/${itemId}.swf`,
  output: `${itemId}.swf`,
  frame,
  role: "clothing",
  depth: DEPTH_BY_SLOT[slot],
  itemId,
  slot,
});

const directionalFrames = Object.freeze([
  Object.freeze({ direction: "down", idle: 1, walk: 9 }),
  Object.freeze({ direction: "down-left", idle: 2, walk: 10 }),
  Object.freeze({ direction: "left", idle: 3, walk: 11 }),
  Object.freeze({ direction: "up-left", idle: 4, walk: 12 }),
  Object.freeze({ direction: "up", idle: 5, walk: 13 }),
  Object.freeze({ direction: "up-right", idle: 6, walk: 14 }),
  Object.freeze({ direction: "right", idle: 7, walk: 15 }),
  Object.freeze({ direction: "down-right", idle: 8, walk: 16 }),
]);

const throwFrames = Object.freeze([
  Object.freeze({ direction: "down-left", frame: 27 }),
  Object.freeze({ direction: "up-left", frame: 28 }),
  Object.freeze({ direction: "up-right", frame: 29 }),
  Object.freeze({ direction: "down-right", frame: 30 }),
]);

const BUILD_ASSETS = Object.freeze([
  penguinAsset("idle.swf", 1),
  penguinAsset("walk.swf", 15),
  penguinAsset("wave.swf", 25),
  penguinAsset("dance.swf", 26),
  penguinAsset("throw.swf", 27),
  ...[57, 33, 32, 34, 35, 36, 37, 42, 44, 71].map(actionAsset),
  clothingAsset(403, 36, "head"),
  clothingAsset(424, 33, "head"),
  clothingAsset(263, 33, "body"),
  clothingAsset(5084, 71, "hand"),
  clothingAsset(212, 32, "body"),
  clothingAsset(262, 34, "body"),
  clothingAsset(407, 34, "head"),
  clothingAsset(325, 37, "hand"),
  clothingAsset(335, 42, "hand"),
  clothingAsset(233, 44, "hand"),
  clothingAsset(5016, 56, "hand"),
  ...directionalFrames.map(({ direction, idle }) => penguinAsset(`idle-${direction}.swf`, idle)),
  ...directionalFrames.map(({ direction, walk }) => penguinAsset(`walk-${direction}.swf`, walk)),
  ...throwFrames.map(({ direction, frame }) => penguinAsset(`throw-${direction}.swf`, frame)),
]);

const BUILD_ASSET_BY_OUTPUT = new Map(BUILD_ASSETS.map((asset) => [asset.output, asset]));
if (BUILD_ASSET_BY_OUTPUT.size !== BUILD_ASSETS.length) {
  throw new Error("Render build asset outputs must be unique");
}

export const EXPANDED_SWF_JOBS = Object.freeze(BUILD_ASSETS.map(({ input, output, frame }) =>
  Object.freeze({ input, output, frame }),
));

function layer(output) {
  const asset = BUILD_ASSET_BY_OUTPUT.get(output);
  if (!asset) throw new Error(`Unknown render build asset: ${output}`);
  return Object.freeze({
    asset: `generated/expanded-stage/${asset.output}`,
    role: asset.role,
    depth: asset.depth,
    itemId: asset.itemId,
    slot: asset.slot,
  });
}

const layers = (...outputs) => Object.freeze(outputs.map(layer));
const BASE_LAYERS = Object.freeze({
  penguin: layers("idle.swf"),
  walk: layers("walk.swf"),
  wave: layers("wave.swf"),
  dance: layers("dance.swf"),
  breakdance: layers("57.swf", "5016.swf"),
  hula: layers("32.swf", "212.swf"),
  maracas: layers("42.swf", "335.swf"),
  guitar: layers("44.swf", "233.swf"),
  jackhammer: layers("36.swf", "403.swf"),
  pizza: layers("33.swf", "263.swf", "424.swf"),
  mop: layers("71.swf", "5084.swf"),
  coffee: layers("34.swf", "262.swf"),
  snowball: layers("throw.swf"),
  propeller: layers("35.swf", "407.swf"),
  swim: layers("37.swf", "325.swf"),
});

const DIRECTIONAL_PREFIXES = Object.freeze({
  penguin: "idle",
  walk: "walk",
  snowball: "throw",
});

function layersFor(actionId, direction) {
  if (!direction) {
    const result = BASE_LAYERS[actionId];
    if (!result) throw new Error(`Missing render layers for ${actionId}`);
    return result;
  }
  const prefix = DIRECTIONAL_PREFIXES[actionId];
  if (!prefix) throw new Error(`${actionId} has no directional render track`);
  return layers(`${prefix}-${direction}.swf`);
}

function assertUniqueClothingSlots(actionLayers) {
  const occupied = new Map();
  for (const entry of actionLayers) {
    if (!entry.itemId) continue;
    if (occupied.has(entry.slot)) {
      throw new Error(`Clothing items ${occupied.get(entry.slot)} and ${entry.itemId} both occupy ${entry.slot}`);
    }
    occupied.set(entry.slot, entry.itemId);
  }
}

const safeDirectory = (compositionId) => compositionId.replaceAll(":", "--");
const frameNames = (count) => {
  const digits = String(count).length;
  return Array.from({ length: count }, (_, index) =>
    `${String(index).padStart(digits, "0")}.png`,
  );
};

function composition(actionId, direction, actionLayers) {
  const id = direction ? `${actionId}:${direction}` : actionId;
  const directory = safeDirectory(id);
  const frameCount = ACTION_FRAME_COUNTS[actionId];
  if (!frameCount) throw new Error(`Missing frame count for ${actionId}`);
  assertUniqueClothingSlots(actionLayers);

  return Object.freeze({
    id,
    actionId,
    direction: direction ?? null,
    fps: RENDER_FPS,
    playback: PLAYBACK_BY_ACTION[actionId] ?? "loop",
    frameCount,
    ...(LOOP_START_BY_ACTION[actionId] === undefined
      ? {}
      : { loopStart: LOOP_START_BY_ACTION[actionId] }),
    sourceSequence: SOURCE_SEQUENCES[actionId] ?? null,
    layers: Object.freeze(actionLayers.map((entry, index) => {
      const fileName = entry.asset.split("/").at(-1);
      const layerDirectory = `${String(index).padStart(2, "0")}-${fileName.replace(/\.swf$/, "")}`;
      const frameDirectory = `generated/render-frames/${directory}/${layerDirectory}`;
      return Object.freeze({
        role: entry.role,
        depth: entry.depth,
        source: entry.asset,
        outputDirectory: frameDirectory,
        frames: Object.freeze(frameNames(frameCount).map((name) => `${frameDirectory}/${name}`)),
      });
    })),
  });
}

export function createRenderSourceManifest() {
  const compositions = {};
  for (const [actionId, action] of Object.entries(ACTIONS)) {
    const base = composition(actionId, null, layersFor(actionId));
    compositions[base.id] = base;
    for (const direction of action.directions) {
      const directional = composition(actionId, direction, layersFor(actionId, direction));
      compositions[directional.id] = directional;
    }
  }
  return Object.freeze({
    version: 1,
    fps: RENDER_FPS,
    viewport: RENDER_VIEWPORT,
    registration: Object.freeze({
      localBounds: Object.freeze({ x: -70, y: -85, width: 160, height: 180 }),
      pivot: Object.freeze({ x: 70, y: 85 }),
      untrimmed: true,
      captureScale: RENDER_CAPTURE_SCALE,
    }),
    captureSize: Object.freeze({
      width: RENDER_VIEWPORT.width * RENDER_CAPTURE_SCALE,
      height: RENDER_VIEWPORT.height * RENDER_CAPTURE_SCALE,
    }),
    compositions: Object.freeze(compositions),
  });
}

export const RENDER_SOURCE_MANIFEST = createRenderSourceManifest();
