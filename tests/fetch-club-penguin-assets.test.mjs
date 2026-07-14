import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  ASSET_MANIFEST,
  assetDownloadUrls,
  verifyAssetBytes,
} from "../scripts/fetch-club-penguin-assets.mjs";
import { EXPANDED_SWF_JOBS } from "../scripts/render-source-manifest.mjs";

test("download manifest covers exactly the SWFs consumed by the renderer", () => {
  const required = [...new Set(EXPANDED_SWF_JOBS.map(({ input }) => input))].sort();
  assert.deepEqual(ASSET_MANIFEST.map(({ path }) => path).sort(), required);
});

test("mirror URLs map project paths to the archived Club Penguin hierarchy", () => {
  assert.deepEqual(assetDownloadUrls("assets/actions/33.swf"), {
    viewer: "https://icerink.solero.me/media1.clubpenguin.com/play/v2/content/global/penguin/actions/33.swf",
    raw: "https://icerink.solero.me/src/media1.clubpenguin.com/play/v2/content/global/penguin/actions/33.swf",
  });
  assert.match(
    assetDownloadUrls("assets/clothing/sprites/403.swf").raw,
    /global\/clothing\/sprites\/403\.swf$/,
  );
});

test("download verification rejects HTML and hash drift", () => {
  const bytes = Buffer.from("CWSfixture");
  const entry = {
    path: "assets/example.swf",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  assert.doesNotThrow(() => verifyAssetBytes(entry, bytes));
  assert.throws(() => verifyAssetBytes(entry, Buffer.from("<!DOCTYPE html>")), /not an SWF/);
  assert.throws(() => verifyAssetBytes(entry, Buffer.from("CWSdifferent")), /hash mismatch/);
});
