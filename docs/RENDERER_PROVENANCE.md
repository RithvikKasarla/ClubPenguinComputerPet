# Renderer provenance

The renderer follows the same high-level composition rules used by Project
Flipper's Club Penguin client:

- body, overlay, and clothing share local origin `(0, 0)`;
- clothing order comes from canonical slot depths;
- animation tracks run at 24 FPS;
- one action selection is applied to body, overlay, and clothing together.
- Wave uses Project Flipper's explicit `1..12, 5..12, 5..12, 1`
  sequence, while throw tracks are non-repeating.

Reference source: `project-flipper/ClubPenguin` at commit
`1d90cfc13d0c96c6ca686b561c0d08814a7b0da4` (`package.json` declares ISC).
The relevant reference files are `src/world/avatar/penguin.ts`,
`src/world/engine/clothing/clothingManager.ts`, and
`src/world/engine/player/playerManager.ts`.

Project Flipper does not include its media atlas, and no Club Penguin artwork
is committed here. `npm run setup:assets` downloads the 22 SWFs consumed by the
renderer from the community-maintained Ice Rink archive and verifies each file
against a pinned SHA-256 digest. Frames in `generated/render-frames` are
deterministic local renders of those ignored inputs.

Frame capture uses Ruffle's official exporter from Ruffle `0.3.0`, commit
`4d3637f0ab2b0276e00f93a160de545db0f25c66`, matching the web runtime version
that originally powered this project. Apply
`scripts/ruffle-exporter-transparent.patch` before compiling it. The patch
only selects Ruffle's existing transparent window mode; without it the CLI
clears each captured layer to opaque white even though `capture_frame()`
returns RGBA pixels. Ruffle is used only during render-asset generation; the
action viewer plays generated frames with one Canvas2D clock.

`npm run setup:exporter` performs the pinned clone, patch, and Cargo build into
the ignored `.cache/ruffle-exporter` directory. It requires `cargo`, `git`, and
Java. The default `npm run build` first fetches the verified media inputs, then
invokes the exporter setup automatically and reuses a binary only when both
the Ruffle commit and patch hash match.
