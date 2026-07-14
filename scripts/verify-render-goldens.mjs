import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(
  path.join(root, "generated", "render-frames", "catalog.json"),
));

// Approved against this repository's local SWFs and the pinned Ruffle 0.3.0
// rasterizer. Each digest includes every depth-sorted full-stage layer, so an
// authored registration shift, missing layer, phase change, or pixel change
// fails the build. Project Flipper's media atlas is not publicly available and
// therefore cannot honestly be used as a pixel reference.
const GOLDENS = Object.freeze({
  penguin: Object.freeze({
    0: "4ba4ad88a1d6e8b0f06655e37004f76a4e2023bc93b60a873b22f5b50713cd7d",
  }),
  walk: Object.freeze({
    0: "25e98fcb10b231e91713d74841088d9fce61bcd1529802313f8250e0e7b308aa",
    3: "f4e56357186f634e7ec9f63ceeafc35129574038bb549c17f3ee04fdd0b90005",
    7: "2ec93a47ef0c786317888ba91d96e7d13145278116bb94c3597548964aa175f1",
  }),
  wave: Object.freeze({
    0: "2abefebb5be11932d55c779f0e7ce60830f392de3d2da2caac8206b9b26296eb",
    10: "6dc8ba609281ea38672a956d74b4b5bf620476fa9e8198b3550c8bbb2a50ef13",
    28: "2abefebb5be11932d55c779f0e7ce60830f392de3d2da2caac8206b9b26296eb",
  }),
  dance: Object.freeze({
    0: "d3d70b3b8c798bb3451dcb92613da77bd997dc576e544e87f401fe5ae920cbab",
    50: "da51701834cdbb283b0bd1d4d154ba9f8ca0c56727c8bd0888cc13e76b33ab65",
    192: "52a58a84472790540bcd632e76663fe4044e32a2c18b8d4b40ead0eead30543d",
  }),
  snowball: Object.freeze({
    0: "dd9d7b5e01671d9cf797b8ba3c5309a985135f13fa407f66b5c94203e4b6428c",
    15: "6ad39569d08b07275c5d5290832473ca32a6ee668c82c1bddd6ff0eb73517ae3",
    27: "d48dbc854e55af4352bdded5eb288d09ed0d5e70f44b0e95d1fe6a9e6997d10d",
  }),
  "snowball:down-right": Object.freeze({
    0: "1564a1778f978318ab6578b39342488f0135955cdd22ee1f10d852633afa7a09",
    15: "38be84e14c3624c800a1362380aea0c85a6a62552a44f731bf36b0a2c6440117",
    27: "0982bd041df0643b4cc31811bfd7b0456aaa1c90927babbe6aed18620ff9dd22",
  }),
  jackhammer: Object.freeze({
    0: "cd09fedbf88919a5ad302950ca2b8d1961e244fd79e014fca03d1209aac53c00",
    1: "f1b4d0a0502fddf5bea1f21de9d1d1f146360531e4393c653ddb0f5a57f0e905",
    16: "431358c2688c19131ae639f9e4366a5ea4eeefe4c6ec5002a5c3a35344d205c2",
    32: "431358c2688c19131ae639f9e4366a5ea4eeefe4c6ec5002a5c3a35344d205c2",
  }),
  pizza: Object.freeze({
    0: "3e0c58de2198e2ca8925f104fd09ffcc592b123b2b3844594d242ecfc58ce52d",
    1: "d150509e16002f3666ce12d0e9a44f32f19de91251d30814be2b9bf63e7bb9fa",
    10: "90b66733444d961e6671f9c0e94e84aedfec749547dcf4d6b64369130aa0367d",
    19: "01c748aabca98aa041abe4b34fd8e8d90d83b7c75c8256914df010ef3ff18801",
  }),
  breakdance: Object.freeze({
    0: "25a19bb48eb6096b46fb7093fbbb701ae1a79da96ccde8a750d3a6403ccdcbbe",
    1: "25a19bb48eb6096b46fb7093fbbb701ae1a79da96ccde8a750d3a6403ccdcbbe",
    41: "17f72a8bb475b17503f5fd9808ad223f7e21df054a36fb841ee463dd17976975",
    42: "759c8a3f76ccf640080df26c7bd3d60565e85d415853ba71015f8559aa1ecd37",
    43: "759c8a3f76ccf640080df26c7bd3d60565e85d415853ba71015f8559aa1ecd37",
  }),
  mop: Object.freeze({
    0: "11b6f60d681cdd7e9fcb0af21fa170028a57bb0ce1cf4bcdf34508ca4176cdd0",
    1: "11b6f60d681cdd7e9fcb0af21fa170028a57bb0ce1cf4bcdf34508ca4176cdd0",
    22: "ee9f51c737755846b088b975b63de10f912c8c9561800eba18eeed0f3c2954d3",
    44: "cbd8c004027b759f2d22be7a389863d76981d771ee540da7f8f3ba998742cc09",
  }),
});

let checked = 0;
for (const [compositionId, frames] of Object.entries(GOLDENS)) {
  const composition = catalog.compositions[compositionId];
  if (!composition) throw new Error(`Golden composition is missing: ${compositionId}`);
  for (const [rawIndex, expected] of Object.entries(frames)) {
    const frameIndex = Number(rawIndex);
    const hash = createHash("sha256");
    for (const layer of composition.layers) {
      hash.update(await readFile(path.join(root, layer.frames[frameIndex])));
    }
    const actual = hash.digest("hex");
    if (actual !== expected) {
      throw new Error(`${compositionId} frame ${frameIndex} changed: ${actual}`);
    }
    checked += 1;
  }
}

console.log(`Verified ${checked} approved render goldens`);
