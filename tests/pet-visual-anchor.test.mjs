import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { PNG } from "pngjs";

const root = new URL("../", import.meta.url);

function alphaBounds(png) {
  let minX = png.width;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return { minX, maxX, maxY };
}

test("walking frames keep the penguin's feet on the cursor destination", async () => {
  const [stylesheet, catalogSource] = await Promise.all([
    readFile(new URL("styles.css", root), "utf8"),
    readFile(new URL("generated/render-frames/catalog.json", root), "utf8"),
  ]);
  const actorRule = stylesheet.match(
    /#pet-actor \{[^}]*width: ([\d.]+)px; height: ([\d.]+)px; transform: translate\((-?[\d.]+)%, (-?[\d.]+)%\)/,
  );
  assert.ok(actorRule, "pet actor geometry must be declared in the main stylesheet");

  const [, rawActorWidth, rawActorHeight, rawTranslateX, rawTranslateY] = actorRule;
  const actorWidth = Number(rawActorWidth);
  const actorHeight = Number(rawActorHeight);
  const translateX = Number(rawTranslateX) / 100;
  const translateY = Number(rawTranslateY) / 100;
  const catalog = JSON.parse(catalogSource);
  const scale = actorHeight / catalog.captureSize.height;
  const canvasWidth = catalog.captureSize.width * scale;

  for (const [compositionId, composition] of Object.entries(catalog.compositions)) {
    if (!compositionId.startsWith("walk:")) continue;

    for (const frame of composition.layers[0].frames) {
      const png = PNG.sync.read(await readFile(new URL(frame, root)));
      const { minX, maxX, maxY } = alphaBounds(png);
      const footOffsetX = actorWidth * translateX
        + (actorWidth - canvasWidth) / 2
        + ((minX + maxX) / 2) * scale;
      const footOffsetY = actorHeight * translateY + maxY * scale;

      assert.ok(
        Math.abs(footOffsetX) <= 5 && Math.abs(footOffsetY) <= 5,
        `${compositionId} ${frame} foot offset was (${footOffsetX.toFixed(1)}, ${footOffsetY.toFixed(1)})px`,
      );
    }
  }
});
