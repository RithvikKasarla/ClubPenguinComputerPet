import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIEWER_BASE =
  "https://icerink.solero.me/media1.clubpenguin.com/play/v2/content/global";
const RAW_BASE =
  "https://icerink.solero.me/src/media1.clubpenguin.com/play/v2/content/global";

export const ASSET_MANIFEST = Object.freeze([
  { path: "assets/penguin.swf", sha256: "f089b4c1fc17d7f6a53e352cee199dc4b30128b3bca909a03dac3505e8366b7e" },
  { path: "assets/actions/32.swf", sha256: "8eaab48a454e01237e627a95918dca8c0ea781393a982e4477cc75868df2b3fa" },
  { path: "assets/actions/33.swf", sha256: "4a680f7c26337bebe189379a0abd4a17c578049f639c2aa11e15f440ce9069dd" },
  { path: "assets/actions/34.swf", sha256: "28fe9aefc6a46a60fd19c728ddbdc9eb71441f49853a60ade7136ff37e4425cb" },
  { path: "assets/actions/35.swf", sha256: "9ede24598a7a40626f9e6805c568006ce4afa8bb6b0dc1fdb479abe7537d269d" },
  { path: "assets/actions/36.swf", sha256: "d220e92166b12b57be5553433f6bb23b6c9c7bfa2d80bf9042a58320e553832a" },
  { path: "assets/actions/37.swf", sha256: "baf8b5d1806359bdada868a5e6315e0c8a9faef67bcae4b3ae82551cb9493c62" },
  { path: "assets/actions/42.swf", sha256: "3b5395ed54f9881884556149bfb6c728a45d9d62d53f5110c0be3d0721a54fe3" },
  { path: "assets/actions/44.swf", sha256: "4064bb164be83cad06ef888742a5990e01a8380a5818cff387aa9d560f2d4d28" },
  { path: "assets/actions/57.swf", sha256: "fe13a9a0f4226d7ad0fa3b7890909576e478614fbe4162bb82ecc51fe1a141c6" },
  { path: "assets/actions/71.swf", sha256: "b6b78007c1d74b70a32b47604569de1ccc09ba0f81ab540c1aa5913424a1531c" },
  { path: "assets/clothing/sprites/212.swf", sha256: "faf80ae9a917ab4ace5a80868b8f06cd0431f68fe72c3e29506b6bc3b63ce45d" },
  { path: "assets/clothing/sprites/233.swf", sha256: "c56d409172f17a9ae274781abfc73274eb97a6bdfe420411a7e0c8cff4b1dcf0" },
  { path: "assets/clothing/sprites/262.swf", sha256: "0493c0ac96cffc0cf90d9056063a341e5b93079293b8bebdd93e00e4b3aaa829" },
  { path: "assets/clothing/sprites/263.swf", sha256: "4427034e7306d5e89200a8c492de647246d3f9c996e4a20feaa22f83a29f552b" },
  { path: "assets/clothing/sprites/325.swf", sha256: "1da9068c79524363b693ce60dbe573f6dc079b83f6be283d1c1a922762cc4e38" },
  { path: "assets/clothing/sprites/335.swf", sha256: "014a8cd75c91bfe0e91688dde7fdaa936360ab0a3a1e5bf23a623ed3eea12f0d" },
  { path: "assets/clothing/sprites/403.swf", sha256: "12adf53b82e4d07d6723336936ffcaefb192b78769d8127ddb693a19b0f8d223" },
  { path: "assets/clothing/sprites/407.swf", sha256: "86e15a6441639ddf4bf8b5ea407234caa37f7ffb1eacb4b1ee8e53aa3fb0b30e" },
  { path: "assets/clothing/sprites/424.swf", sha256: "d914de70df3cd0a1331611f3ebb78514e7c81b455b4f4e0ede798b1a47b4a645" },
  { path: "assets/clothing/sprites/5016.swf", sha256: "36881ac4ff650fe2cb031ece0363c7bf7f3002e90d6cd10ac9dcbb50353f29d4" },
  { path: "assets/clothing/sprites/5084.swf", sha256: "a0b10d48fbff63013c8751435eca384d9defe9656ea79a16ed80b03025dbbe12" },
].map(Object.freeze));

function archivePath(projectPath) {
  if (projectPath === "assets/penguin.swf") return "penguin/penguin.swf";
  if (projectPath.startsWith("assets/actions/")) {
    return `penguin/actions/${projectPath.slice("assets/actions/".length)}`;
  }
  if (projectPath.startsWith("assets/clothing/")) {
    return `clothing/${projectPath.slice("assets/clothing/".length)}`;
  }
  throw new RangeError(`No Club Penguin archive mapping for ${projectPath}`);
}

export function assetDownloadUrls(projectPath) {
  const relative = archivePath(projectPath);
  return {
    viewer: `${VIEWER_BASE}/${relative}`,
    raw: `${RAW_BASE}/${relative}`,
  };
}

export function verifyAssetBytes(entry, bytes) {
  const signature = Buffer.from(bytes).subarray(0, 3).toString("ascii");
  if (!["FWS", "CWS", "ZWS"].includes(signature)) {
    throw new Error(`${entry.path} is not an SWF (received ${JSON.stringify(signature)})`);
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256) {
    throw new Error(`${entry.path} hash mismatch: expected ${entry.sha256}, received ${actual}`);
  }
}

async function isCurrent(entry, destination) {
  try {
    verifyAssetBytes(entry, await readFile(destination));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    return false;
  }
}

async function downloadAsset(entry, { root = projectRoot, fetchImpl = fetch } = {}) {
  const destination = path.join(root, entry.path);
  if (await isCurrent(entry, destination)) {
    console.log(`verified ${entry.path}`);
    return;
  }

  const urls = assetDownloadUrls(entry.path);
  const response = await fetchImpl(urls.raw, {
    headers: {
      Accept: "application/x-shockwave-flash,*/*;q=0.8",
      Referer: urls.viewer,
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`Unable to fetch ${urls.viewer}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  verifyAssetBytes(entry, bytes);

  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.download-${process.pid}`;
  try {
    await writeFile(temporary, bytes, { mode: 0o644 });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  console.log(`downloaded ${entry.path}`);
}

export async function fetchClubPenguinAssets(options = {}) {
  for (const entry of ASSET_MANIFEST) await downloadAsset(entry, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await fetchClubPenguinAssets({
    root: process.env.CLUB_PENGUIN_ASSET_ROOT
      ? path.resolve(process.env.CLUB_PENGUIN_ASSET_ROOT)
      : projectRoot,
  });
}
