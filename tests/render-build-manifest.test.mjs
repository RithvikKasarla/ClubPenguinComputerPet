import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EXPANDED_SWF_JOBS,
  RENDER_SOURCE_MANIFEST,
} from "../scripts/render-source-manifest.mjs";

const jobFor = (output) => EXPANDED_SWF_JOBS.find((job) => job.output === output);

test("base action movies select the intended physical root frames", () => {
  assert.deepEqual(jobFor("wave.swf"), {
    input: "assets/penguin.swf",
    output: "wave.swf",
    frame: 25,
  });
  assert.deepEqual(jobFor("dance.swf"), {
    input: "assets/penguin.swf",
    output: "dance.swf",
    frame: 26,
  });
});

test("source-specific sparse clothing root frames are explicit", () => {
  assert.deepEqual(jobFor("407.swf"), {
    input: "assets/clothing/sprites/407.swf",
    output: "407.swf",
    frame: 34,
  });
  assert.deepEqual(jobFor("5016.swf"), {
    input: "assets/clothing/sprites/5016.swf",
    output: "5016.swf",
    frame: 56,
  });
});

test("special action movies select their shared animated root frame", () => {
  const specialActions = EXPANDED_SWF_JOBS.filter(({ input }) =>
    input.startsWith("assets/actions/"),
  );

  assert.equal(specialActions.length, 10);
  for (const job of specialActions) {
    assert.equal(job.frame, 2, `${job.input} must start from root frame 2`);
  }
});

test("the SWF build contains exactly the sources consumed by render compositions", () => {
  const outputs = EXPANDED_SWF_JOBS.map(({ output }) => output);
  const renderSources = new Set(
    Object.values(RENDER_SOURCE_MANIFEST.compositions).flatMap(({ layers }) =>
      layers.map(({ source }) => source.split("/").at(-1)),
    ),
  );

  assert.equal(outputs.length, new Set(outputs).size, "build outputs must be unique");
  assert.deepEqual(new Set(outputs), renderSources);
});
