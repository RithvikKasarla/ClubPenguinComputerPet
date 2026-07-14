import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPANDED_STAGE_BOUNDS,
  EXPANDED_SWF_JOBS,
} from "./render-source-manifest.mjs";
import { transformSwf } from "./swf-tools.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "generated", "expanded-stage");
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const job of EXPANDED_SWF_JOBS) {
  const input = await readFile(path.join(root, job.input));
  const output = transformSwf(input, {
    bounds: EXPANDED_STAGE_BOUNDS,
    frame: job.frame,
  });
  await writeFile(path.join(outputDirectory, job.output), output);
  console.log(`${job.input} -> generated/expanded-stage/${job.output} (root frame ${job.frame})`);
}
