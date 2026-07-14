import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { inspectSwf, transformSwf } from "../scripts/swf-tools.mjs";

const bounds = { xmin: -1400, xmax: 1800, ymin: -1700, ymax: 1900 };

test("a clothing timeline can be frozen on its special-action frame", async () => {
  const source = await readFile("assets/clothing/sprites/403.swf");
  const transformed = transformSwf(source, { bounds, frame: 36 });
  const info = inspectSwf(transformed);

  assert.equal(info.signature, "CWS");
  assert.equal(info.frameCount, 1);
  assert.ok(transformed.length > 1_000);
});

test("asking for a missing clothing frame fails clearly", async () => {
  const source = await readFile("assets/clothing/sprites/263.swf");
  assert.throws(
    () => transformSwf(source, { bounds, frame: 34 }),
    /fewer than 34 root frames/,
  );
});
