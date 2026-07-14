import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

import { RENDER_SOURCE_MANIFEST } from "./render-source-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exporter = path.join(root, ".cache", "ruffle-exporter", "ruffle-exporter");
const renderOutput = path.join(root, "generated", "render-frames");

function runExporter(arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(exporter, arguments_, { cwd: root, stdio: "inherit" });
    child.once("error", (error) => reject(new Error(
      `Unable to start the pinned Ruffle exporter. Run npm run setup:exporter first.`,
      { cause: error },
    )));
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Ruffle exporter exited with status ${code}`));
    });
  });
}

async function assertFrame(pathName) {
  const bytes = await readFile(pathName);
  const pngSignature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`Exporter did not produce a PNG: ${pathName}`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== RENDER_SOURCE_MANIFEST.captureSize.width
    || height !== RENDER_SOURCE_MANIFEST.captureSize.height) {
    throw new Error(`Unexpected frame size ${width}x${height}: ${pathName}`);
  }
  const png = PNG.sync.read(bytes);
  const edgeGuard = 12;
  let visiblePixels = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha === 0) continue;
      visiblePixels += 1;
      if (x < edgeGuard || y < edgeGuard
        || x >= png.width - edgeGuard || y >= png.height - edgeGuard) {
        throw new Error(`Visible art touches the ${edgeGuard}px capture guard: ${pathName}`);
      }
    }
  }
  if (visiblePixels === 0) throw new Error(`Render frame is empty: ${pathName}`);
}

await rm(renderOutput, { recursive: true, force: true });
await mkdir(renderOutput, { recursive: true });

for (const composition of Object.values(RENDER_SOURCE_MANIFEST.compositions)) {
  for (const layer of composition.layers) {
    const source = path.join(root, layer.source);
    await access(source);
    const outputDirectory = path.join(root, layer.outputDirectory);
    await mkdir(outputDirectory, { recursive: true });
    const captureCount = composition.sourceSequence
      ? Math.max(...composition.sourceSequence) + 1
      : composition.frameCount;
    const output = captureCount === 1
      ? path.join(outputDirectory, "0.png")
      : outputDirectory;
    await runExporter([
      source,
      output,
      "--frames", String(captureCount),
      "--width", String(RENDER_SOURCE_MANIFEST.captureSize.width),
      "--height", String(RENDER_SOURCE_MANIFEST.captureSize.height),
      "--force-play",
      "--silent",
    ]);
    if (composition.sourceSequence) {
      const digits = String(captureCount).length;
      const sourceFrames = await Promise.all(
        Array.from({ length: captureCount }, (_, index) =>
          readFile(path.join(outputDirectory, `${String(index).padStart(digits, "0")}.png`)),
        ),
      );
      await Promise.all(composition.sourceSequence.map((sourceIndex, outputIndex) =>
        writeFile(path.join(root, layer.frames[outputIndex]), sourceFrames[sourceIndex]),
      ));
    }
    for (const frame of layer.frames) await assertFrame(path.join(root, frame));
    console.log(`${composition.id}: ${layer.source} -> ${layer.outputDirectory}`);
  }
}

const catalogPath = path.join(renderOutput, "catalog.json");
await mkdir(path.dirname(catalogPath), { recursive: true });
await writeFile(catalogPath, `${JSON.stringify(RENDER_SOURCE_MANIFEST, null, 2)}\n`);
console.log("Wrote generated/render-frames/catalog.json");

const compositions = Object.values(RENDER_SOURCE_MANIFEST.compositions);
const coverage = {
  version: 1,
  actionCount: new Set(compositions.map(({ actionId }) => actionId)).size,
  compositionCount: compositions.length,
  layerTrackCount: compositions.reduce((total, entry) => total + entry.layers.length, 0),
  frameImageCount: compositions.reduce(
    (total, entry) => total + entry.layers.length * entry.frameCount,
    0,
  ),
  unsupportedExposedActions: [],
};
await writeFile(
  path.join(root, "generated", "render-frames", "coverage.json"),
  `${JSON.stringify(coverage, null, 2)}\n`,
);
console.log(`Coverage: ${coverage.actionCount} actions, ${coverage.compositionCount} compositions, ${coverage.frameImageCount} frames`);
