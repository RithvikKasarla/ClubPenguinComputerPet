# Club Penguin render alignment research

Research date: 2026-07-14  
Audience: implementation agent  
Decision scope: align this repository's penguin rendering with `project-flipper/ClubPenguin`; use `project-flipper/Island` only as catalog and special-action metadata.

## Executive summary

The visible mismatch is not primarily a CSS-positioning problem. The local viewer already gives every SWF layer the same stage rectangle and uses the same clothing depth order as Project Flipper. The largest fidelity gap is that each body or clothing layer is a separate Ruffle movie with its own timeline. Starting those movies inside one `requestAnimationFrame` callback reduces startup skew, but it does not establish one authoritative playhead, prevent later drift, or make frame-exact testing possible.

The recommended target is a frame-addressable atlas renderer modeled on Project Flipper:

1. Convert the base penguin body, overlay, and clothing SWFs into atlas frames while preserving each frame's authored registration point/pivot.
2. Represent frames with semantic keys such as `penguin/body/{actionId};{subframe}` and `{itemId}/{actionId};{subframe}`.
3. Drive every visible layer from one renderer-owned 24 FPS clock and one resolved subframe.
4. Build action compositions from a checked-in generated catalog, using Island's `paper_items.json` for item type/name and `penguin_action_frames.json` for equipment-to-special-action rules.
5. Keep semantic action IDs separate from physical SWF root-frame indices. They are not one universal numbering system.

Do **not** add per-item CSS offsets as the general fix. Project Flipper places body, overlay, and clothing sprites at local `(0, 0)` and relies on atlas registration data. Local offsets would mask importer errors and create an unmaintainable exception table.

An effective interim solution is to generate one precomposed SWF or one pre-rendered frame sequence per supported action, then use one Ruffle player (or one canvas sprite) per penguin. That removes cross-player clock drift without requiring the complete catalog migration immediately.

## Sources and version boundary

This document uses only primary sources:

- This repository's source and tests as of 2026-07-14.
- [`project-flipper/ClubPenguin` commit `1d90cfc`](https://github.com/project-flipper/ClubPenguin/tree/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4), inspected from a local shallow clone and linked to commit-pinned GitHub source.
- [`project-flipper/Island` commit `f7368bb`](https://github.com/project-flipper/Island/tree/f7368bba8934ce5c0f94a4d5b5d4ebffd2e76890), inspected from a local clone and linked to commit-pinned GitHub data.

Project Flipper is the rendering reference. Island is **not** a rendering implementation and should not be treated as one; it supplies authoritative-enough catalog records and equipment/action combinations for this migration.

## Current local architecture

### Build-time SWF transformation

[`scripts/build-expanded-swfs.mjs`](../scripts/build-expanded-swfs.mjs) transforms selected source SWFs into `generated/expanded-stage/` using a common synthetic stage rectangle of `x=-70..90` and `y=-85..95` pixels. It also selects a root frame for base actions and clothing movies. [`scripts/swf-tools.mjs`](../scripts/swf-tools.mjs) implements that by retaining tags through a requested root frame, discarding later control tags, setting the root movie to one frame, and leaving nested sprite timelines intact.

This makes the assets usable as standalone Ruffle movies, but it changes their presentation contract:

- Every output receives an arbitrary common stage rectangle rather than an atlas frame with an explicit pivot.
- A selected clothing root frame becomes a one-frame root movie whose nested clip still animates independently.
- The build manifest manually embeds frame-number assumptions.
- Only the listed jobs are generated.

The local source inventory currently contains 111 action SWFs, 12 clothing sprite SWFs, and one base `penguin.swf`. The UI exposes 15 semantic actions in [`src/actions.mjs`](../src/actions.mjs), so the existing renderer is a curated demonstration rather than a full wardrobe catalog renderer.

### Runtime composition

[`scripts/render-source-manifest.mjs`](../scripts/render-source-manifest.mjs) is the single build-time owner of each action's SWF source, physical root frame, layer role, slot, and depth. For example:

- Pizza is action `33` plus body item `263` and head item `424`.
- Jackhammer is action `36` plus head item `403`.
- Mop is action `71` plus hand item `5084`.

The original implementation created one Ruffle player per layer. That migration renderer was removed after this research: [`src/penguin-renderer.mjs`](../src/penguin-renderer.mjs) now resolves every layer from one integer playhead and draws them atomically to one canvas. [`src/viewer.mjs`](../src/viewer.mjs) switches whole generated compositions.

Generated frames use one fixed local viewport and are drawn at `(0, 0)` inside the same `760 x 480` actor. [`tests/penguin-renderer.test.mjs`](../tests/penguin-renderer.test.mjs) checks shared-frame selection, loop wrap, pause/resume, and seek.

### What the current tests prove—and do not prove

The tests establish:

- action records have stable automation metadata;
- selected special actions include the expected manually chosen layer files;
- all rendered layers resolve from the same integer playhead;
- pause/resume, seek, and loop wrap retain phase;
- stale asynchronous composition loads cannot commit;
- a physical clothing root frame can be frozen and missing frames fail clearly.

They do not establish:

- generalized arbitrary-wardrobe composition beyond the curated action catalog;
- every source frame retains its authored pivot after conversion;
- the chosen physical root frame corresponds to the intended semantic action;
- a composed pixel result matches Project Flipper.

## Project Flipper reference architecture

### One local coordinate system

Project Flipper's penguin is a Phaser container. Its body and overlay sprites are both created at `(0, 0)` and added to that container ([`penguin.ts`, lines 11–48](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/avatar/penguin.ts#L11-L48)). Clothing sprites are also created at `(0, 0)`, added to the player container, and sorted by depth ([`clothingManager.ts`, lines 241–257](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/clothing/clothingManager.ts#L241-L257)).

The important implication is that position is authored into the extracted frame/atlas metadata. The renderer does not carry an item-specific `x/y` placement table.

### Explicit depth policy

Project Flipper maps clothing slots to depths as follows ([`clothingManager.ts`, lines 210–231](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/clothing/clothingManager.ts#L210-L231)):

| Slot | Item type | Depth |
| --- | ---: | ---: |
| Base body/overlay | — | container insertion order / base | 0 locally |
| Feet | 7 | 210 |
| Body | 5 | 220 |
| Neck | 4 | 230 |
| Hand/tool | 6 | 240 |
| Face | 3 | 250 |
| Head | 2 | 260 |
| Other | 10 | 270 |

The local action declarations use the same values for their selected body, hand, and head layers. Depth is therefore not the main source of the reported lag, although the importer should derive it from item type rather than repeat literal numbers in action records.

### Frame-addressable atlases

Project Flipper loads clothing as a Phaser multiatlas (`assets/clothing/sprites/{id}.json`) and parses frame keys shaped like:

```text
{itemId}/{actionFrame}
{itemId}/{actionFrame};{subframe}
```

It sorts by action frame and subframe, then builds one Phaser animation for each supported action ([`clothingManager.ts`, lines 266–348](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/clothing/clothingManager.ts#L266-L348)). Base penguin frames use analogous keys:

```text
penguin/body/{actionFrame}
penguin/body/{actionFrame};{subframe}
penguin/overlay/{actionFrame}
penguin/overlay/{actionFrame};{subframe}
```

([`playerManager.ts`, lines 79–128](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/player/playerManager.ts#L79-L128)).

Both base and clothing animations are configured for 24 FPS with skipped missed frames. The local SWFs inspected for this research also declare 24 FPS, so the nominal rate agrees; the gap is ownership of the playhead, not the nominal rate.

### Coordinated action changes

Project Flipper starts the body animation, overlay animation, and every available clothing animation from one `playAnimation(index)` operation ([`penguin.ts`, lines 142–161](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/avatar/penguin.ts#L142-L161)). Those sprites advance through Phaser's shared game update loop.

This is materially stronger than several independent embedded movies. For this repository, the target can be stricter still: calculate one integer subframe from one renderer clock, and apply that exact subframe to every layer rather than relying on several animation objects to remain in phase.

### Base action metadata

Project Flipper declares wave as action index `24` and dance as `25` ([`animationFrame.ts`, lines 2–38](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/player/animationFrame.ts#L2-L38)). Its penguin metadata declares 29 wave frames and 193 dance frames ([`penguin.ts`, lines 73–117](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/avatar/penguin.ts#L73-L117)). Wave receives a non-linear frame sequence in both the body and clothing builders, including repeated `5..12` segments ([`playerManager.ts`, lines 89–105](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/player/playerManager.ts#L89-L105), [`clothingManager.ts`, lines 319–338](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/clothing/clothingManager.ts#L319-L338)). Frame fidelity therefore requires an ordered frame sequence, not merely `0..N-1` for every action.

## Evidence-backed gap analysis

### 1. Spatial registration: common origin is right; synthetic framing is fragile

**Aligned today:** Every local Ruffle layer occupies the same actor rectangle, and every transformed SWF receives the same expanded bounds. Project Flipper likewise creates body, overlay, and clothing at local `(0, 0)`.

**Remaining gap:** Project Flipper's atlas frames can retain trim and pivot/registration metadata per frame. The local build replaces only the SWF stage rectangle with a fixed hand-selected rectangle. That is sufficient for the current samples, but it cannot prove that every action and item shares the same visible crop or scale. A wider prop can be clipped; a differently authored source can be scaled by `showAll`; a mistaken source transform can look like a CSS offset.

**Decision:** Preserve an explicit pivot and untrimmed source rectangle during extraction. All runtime sprites remain at `(0, 0)`. Treat a per-item runtime offset as an exceptional, source-documented migration shim only.

### 2. Depth: largely aligned but manually encoded

**Aligned today:** Local depths `210..270` match Project Flipper's slot ordering.

**Remaining gap:** The curated build manifest records slot and depth directly. Island's paper item records already identify item type—for example Hard Hat `403` is type `2`, Pizza Apron `263` is type `5`, and Red Electric Guitar `233` is type `6` ([`paper_items.json`, Hard Hat](https://github.com/project-flipper/Island/blob/f7368bba8934ce5c0f94a4d5b5d4ebffd2e76890/web_service/en/paper_items.json#L2509-L2517), [`paper_items.json`, Pizza Apron](https://github.com/project-flipper/Island/blob/f7368bba8934ce5c0f94a4d5b5d4ebffd2e76890/web_service/en/paper_items.json#L1389-L1397)).

**Decision:** Derive slot and depth from catalog type through one mapping. Validate that an action does not equip two items in the same slot unless an explicit composition rule permits it.

### 3. Timing and clock: the principal gap

**Historical behavior (removed):** `Promise.all` waited for several movies and one `requestAnimationFrame` callback called `resume()` front-to-back.

**Why it remains insufficient:** Each Ruffle player is a separate SWF virtual machine/movie. The callback synchronizes calls, not internal movie time. Browser scheduling, player work, nested timelines, dropped frames, pause/resume, and loop length can produce a stable one-frame phase error or accumulated drift. There is no local API that reads and asserts the current subframe for every movie.

**Reference behavior:** Project Flipper starts all associated Phaser animations in one operation and advances them through one game loop at 24 FPS.

**Decision:** The final renderer owns `epochMs`, `fps`, `actionId`, and integer `subframe`. A render step resolves all layer frame keys from that same value:

```js
const tick = Math.floor((nowMs - epochMs) * 24 / 1000);
const subframe = repeat ? tick % frameSequence.length : Math.min(tick, frameSequence.length - 1);
```

Use an explicit `frameSequence` because wave and possibly other actions repeat or reorder source frames.

### 4. Frame numbering: one field cannot represent all meanings

There are at least three relevant numbers:

1. **Semantic action ID** used by the atlas/runtime (Project Flipper wave `24`, dance `25`).
2. **Legacy/Island secret frame** used to select a special action (pizza `33`, propeller `35`, jackhammer `36`, breakdance `57`, mop `71`).
3. **Physical root-frame index** in a particular source SWF, which is 1-based in the current `freezeRootFrame` transform and may be sparse relative to the semantic ID.

The base penguin build correctly demonstrates a conversion boundary: it selects physical root frame `25` for semantic wave action `24`, and physical root frame `26` for semantic dance action `25`.

Clothing demonstrates that there is no safe universal `+1` or equality rule. Most selected clothing sources use a physical root frame equal to their special frame, but the local Red Propeller Cap SWF has only 34 root frames while its Island special frame is `35`; the Boombox SWF has only 56 roots while its special frame is `57`. The build currently selects physical frames `34` and `56` respectively. These values are plausible source-specific mappings, not evidence that the semantic action should be renamed. Island explicitly maps item `407` to secret frame `35` and item `5016` to secret frame `57` ([propeller rule near `secret_frame: 35`](https://github.com/project-flipper/Island/blob/f7368bba8934ce5c0f94a4d5b5d4ebffd2e76890/web_service/en/penguin_action_frames.json#L690-L706), [boombox rule near `secret_frame: 57`](https://github.com/project-flipper/Island/blob/f7368bba8934ce5c0f94a4d5b5d4ebffd2e76890/web_service/en/penguin_action_frames.json#L4227-L4236)).

**Current decision:** The curated renderer does not expose a legacy action adapter. Its build-only asset records name each source file and physical, 1-based root frame directly; runtime action records contain no SWF or frame-number fields.

### 5. Asset and catalog coverage: curated subset versus systematic import

The local viewer exposes 15 actions and uses only a curated subset of clothing SWFs. Island's English `paper_items.json` contains 5,299 item records. Its `penguin_action_frames.json` contains 685 equipment combinations across four trigger keys (`0`, `25`, `26`, `129`), resolving to 112 distinct `secret_frame` values in the inspected commit.

Those totals do **not** mean all Island records have usable local art. Metadata availability and render-asset availability must be reported separately:

```text
catalog record exists
    + source SWF exists
    + extraction succeeds
    + required action frame exists
    + golden image approved
    = supported renderable item/action
```

**Decision:** Generate a coverage report with explicit statuses. Never silently fall back to a nearby frame; hide unsupported catalog actions or render the base action with a diagnostic.

### 6. Special actions: manually curated today

Island's `penguin_action_frames.json` groups equipment combinations under trigger actions and supplies the resulting `secret_frame`. Within trigger key `26`, for example:

- Chef Hat `424` plus Pizza Apron `263` resolves to secret frame `33` ([lines 600–626](https://github.com/project-flipper/Island/blob/f7368bba8934ce5c0f94a4d5b5d4ebffd2e76890/web_service/en/penguin_action_frames.json#L600-L626)).
- Hard Hat `403` resolves to secret frame `36` ([lines 881–887](https://github.com/project-flipper/Island/blob/f7368bba8934ce5c0f94a4d5b5d4ebffd2e76890/web_service/en/penguin_action_frames.json#L881-L887)).
- Mop and Bucket `5084` resolves to secret frame `71` ([near line 4865](https://github.com/project-flipper/Island/blob/f7368bba8934ce5c0f94a4d5b5d4ebffd2e76890/web_service/en/penguin_action_frames.json#L4857-L4866)).

The local action map has selected several correct examples, but it is hand-authored and cannot cover outfit combinations systematically.

**Decision:** Import the rule table and implement a deterministic resolver:

1. Receive the requested trigger action and equipped slot IDs.
2. Filter rules for that trigger.
3. Match all non-zero rule slots exactly; document whether extra equipped slots are allowed (recommended: allow extras when the rule has `0`, because Island records express required combinations rather than a complete render outfit).
4. Prefer the most specific match (highest number of non-zero slots).
5. Break equal-specificity ties deterministically and emit a build-time ambiguity report.
6. Return `legacySecretFrame`; then map it to the renderer's semantic `actionId` and per-asset source frame.

The importer must preserve Island's trigger keys exactly. Do not assume the outer key and `secret_frame` use the same numbering convention.

## Historical target architecture

> The roadmap below records the research proposal. It is superseded for the
> current curated product: the runtime now uses generated PNG compositions on
> one Canvas2D playhead, has no Ruffle fallback, and intentionally does not
> import Island's legacy action-resolution schema.

```text
Island metadata (pinned input)       Local SWF assets
        |                                  |
        v                                  v
Catalog importer                    Frame/atlas extractor
        |                                  |
        +----------> Generated render catalog <----------+
                              |
                 Outfit + requested action
                              |
                    SpecialActionResolver
                              |
                       ActionComposition
                              |
                  PenguinRenderer (one clock)
                   /       |       |       \
                body    overlay  clothing  effects
```

### Renderer responsibilities

`PenguinRenderer` should own:

- one container transform and scale;
- one action epoch and 24 FPS playhead;
- the ordered semantic frame sequence;
- body, overlay, and clothing sprite instances;
- deterministic depth sorting;
- play, pause, resume, seek, and action replacement;
- completion notification for non-repeating actions.

The renderer should not know Island's raw JSON schema or SWF root-frame quirks. Those belong to generated catalog/import modules.

### Importer responsibilities

The importer should:

- consume a pinned snapshot or explicitly fetched commit of Island metadata;
- normalize paper item records into stable slot/depth data;
- normalize special-action rules without changing their raw trigger/frame values;
- inspect local asset availability;
- extract all frame images plus pivot/untrimmed dimensions;
- translate physical source frames into semantic action IDs through explicit mappings;
- emit deterministic JSON and atlas files;
- emit errors and a coverage report for missing/ambiguous data.

### Runtime data contracts

Suggested contracts (names may be adapted to the repository's JavaScript style):

```ts
type ClothingSlot = "head" | "face" | "neck" | "body" | "hand" | "feet" | "other";

type ItemRecord = {
  itemId: number;
  label: string;
  islandType: number;
  slot: ClothingSlot;
  depth: 210 | 220 | 230 | 240 | 250 | 260 | 270;
  assetStatus: "missing" | "extractable" | "verified";
};

type SourceFrameMapping = {
  assetKind: "penguin" | "action" | "clothing";
  assetId: string;
  semanticActionId: number;
  legacySecretFrame: number | null;
  sourceRootFrame: number | null; // physical, 1-based for current SWF transform
  frameSequence: number[];        // ordered semantic subframes
  repeat: boolean;
};

type AtlasFrame = {
  key: string;                    // e.g. "403/36;7"
  page: string;
  rect: { x: number; y: number; width: number; height: number };
  sourceSize: { width: number; height: number };
  pivot: { x: number; y: number };
};

type Outfit = Partial<Record<ClothingSlot, number>>;

type SpecialActionRule = {
  triggerFrame: number;           // raw Island outer key
  required: Outfit;
  legacySecretFrame: number;
  specificity: number;
};

type ActionComposition = {
  actionId: number;
  fps: 24;
  repeat: boolean;
  frameSequence: number[];
  layers: Array<{
    kind: "body" | "overlay" | "clothing";
    itemId?: number;
    depth: number;
    frameKeyPrefix: string;
  }>;
};
```

Keep the raw imported values available in generated debug metadata. When a visual mismatch appears, the agent must be able to trace runtime key → normalized mapping → source SWF root frame → Island rule.

## Pragmatic interim option

If a full atlas extractor is too large for the next iteration, precompose each supported action into a single timeline:

1. Use the existing layer definitions and source-specific physical root-frame mappings.
2. Build one output movie or one PNG/WebP sequence containing body and required items already composited.
3. Play that result in one Ruffle instance or one canvas element.
4. Give it an explicit 24 FPS/action-duration manifest.

This immediately removes independent-player startup skew and drift. It also makes golden images deterministic. Its costs are duplicated pixels per outfit/action, a larger build output, and no arbitrary wardrobe combinations. It is a bridge, not the final catalog architecture.

Avoid attempting to periodically restart several Ruffle movies. That can hide drift in a demo but introduces visible jumps and still cannot assert subframe equality.

## Phased implementation plan

### Phase 0 — Baseline and diagnostics

- Record the Island and ClubPenguin commit SHAs in a generated-source manifest.
- Extend SWF inspection to report declared FPS, root frame count, bounds, and nested timeline inventory.
- Generate an asset coverage report for all local action and clothing SWFs.
- Capture current screenshots for the supported actions at controlled delays; label these as diagnostic, not authoritative goldens.
- Add explicit records for the known source-frame exceptions (`407`: semantic/legacy 35 → physical 34; `5016`: semantic/legacy 57 → physical 56) and verify them visually before treating them as canonical.

Exit condition: no action depends on an undocumented arithmetic frame conversion.

### Phase 1 — Normalize metadata and action resolution

- Import Island paper items and special-action rules into small generated JSON files.
- Add slot/depth derivation from item type.
- Implement the most-specific deterministic special-action resolver.
- Replace manually repeated item labels/types/depths while retaining the current Ruffle renderer.
- Add ambiguity, missing-item, and missing-art reports.

Exit condition: the current pizza, jackhammer, mop, hula, coffee, propeller, swim, maracas, guitar, and breakdance compositions are reproduced from generated data plus a small explicit allowlist of product-facing actions.

### Phase 2 — Frame extraction proof of concept

- Extract body and overlay atlases for idle, walk, wave, dance, and one special action.
- Extract clothing atlas frames for Pizza Apron `263`, Chef Hat `424`, and Hard Hat `403`.
- Preserve pivots/source sizes; render all sprites at `(0, 0)`.
- Implement a renderer-owned clock with `seek(frame)` for tests.
- Compare at least pizza and jackhammer against Project Flipper frames.

Exit condition: body, overlay, and clothing are pixel-aligned at four or more explicit subframes, including a loop boundary.

### Phase 3 — Replace the live compositor

- Move every supported action to the atlas renderer.
- Keep Ruffle behind a feature flag only for unsupported assets during migration.
- Implement pause/resume/seek against one epoch and verify no phase change across pause.
- Separate world effects such as snowballs from penguin clothing animation; synchronize their spawn events with named/numbered action subframes.

Exit condition: no supported composition creates more than one independent timeline player.

### Phase 4 — Expand coverage and remove migration shims

- Batch-convert remaining local action and clothing assets.
- Approve golden images and mark coverage status per action/item.
- Remove fixed expanded-stage outputs from the production path once no supported action needs them.
- Retain the SWF inspection/conversion tools for provenance and regression diagnosis.

Exit condition: the runtime catalog reports support honestly, all verified actions pass frame-exact tests, and unsupported Island records cannot be selected accidentally.

## Superseded file-level proposal

The following is retained as research history and is not the current implementation plan.

| File | Change |
| --- | --- |
| `scripts/swf-tools.mjs` | Add FPS, bounds, physical-root, nested-frame, and registration inspection; keep physical indices explicitly 1-based. |
| `scripts/build-expanded-swfs.mjs` | Replace positional tuple jobs with named records containing `semanticActionId`, `legacySecretFrame`, and `sourceRootFrame`; later retire from the production renderer. |
| `scripts/import-flipper-metadata.mjs` (new) | Read pinned Island JSON; normalize items/rules; validate schema; emit deterministic generated catalogs and coverage. |
| `scripts/build-penguin-atlases.mjs` (new) | Extract body/overlay/clothing frames with pivots and pack them into atlases. |
| `generated/catalog/source-manifest.json` (new) | Record upstream SHAs, input hashes, importer version, and generation timestamp policy. |
| `generated/catalog/items.json` (new) | Normalized subset/full paper item catalog with asset status. |
| `generated/catalog/special-actions.json` (new) | Normalized rule table retaining raw trigger and secret-frame numbers. |
| `generated/catalog/frame-mappings.json` (new) | Explicit semantic ↔ legacy ↔ physical mapping and frame sequences. |
| `src/action-resolver.mjs` (new) | Resolve outfit + trigger to a deterministic action. No rendering dependencies. |
| `src/penguin-renderer.mjs` (new) | One clock, one subframe, container/layer management, seek/pause/resume. |
| `src/actions.mjs` | Keep product semantics (`label`, group, mode, cooldown), but reference generated composition IDs instead of manually listing asset paths/depths. |
| `src/ruffle-compositor.mjs` | Removed after generated-frame coverage replaced the migration fallback. |
| `src/viewer.mjs` | Instantiate one renderer; expose debug action, outfit, playhead, and frame-seek controls. |
| `tests/action-resolver.test.mjs` (new) | Cover exact, partial, most-specific, ambiguous, and no-match rule behavior. |
| `tests/frame-mappings.test.mjs` (new) | Cover base `24→25`, `25→26`, and source-specific physical mappings such as `35→34`/`57→56`. |
| `tests/penguin-renderer.test.mjs` (new) | Use a fake clock to prove every layer requests the same subframe and pause/resume does not drift. |
| `tests/golden-render.test.mjs` (new) | Render controlled atlas frames and compare approved images with documented tolerances. |

## Test and golden-image strategy

### Unit tests

- **Clock:** Given a fake `now`, every layer receives the identical resolved sequence index.
- **Loop:** Test frame `0`, frame `1`, midpoint, last frame, and first frame after wrap.
- **One-shot:** Clamp at the final frame and emit completion exactly once.
- **Pause/resume:** Advancing wall time while paused must not advance the playhead.
- **Frame sequences:** Verify Project Flipper's wave ordering, including repeated source frames.
- **Depth:** Verify all Island item types map to one canonical slot/depth.
- **Special resolver:** Verify pizza `424+263→33`, hard hat `403→36`, boombox `5016→57`, and mop `5084→71`; verify most-specific selection.
- **Number boundaries:** Verify semantic, legacy, and physical frame fields cannot be substituted for one another.

### Golden frames

Use transparent, fixed-size output and a renderer `seek(sequenceIndex)` API. For each action, capture:

- first frame;
- second frame (best detector of a one-frame offset);
- a frame where the prop reaches an extreme position;
- last frame;
- first frame after loop wrap for repeating actions.

Initial matrix:

| Action | Required layers | Critical check |
| --- | --- | --- |
| Idle | body + overlay | pivot and color overlay |
| Walk | body + overlay | eight directions/sequence boundaries |
| Wave | body + overlay + representative clothing | repeated frame sequence parity |
| Dance | body + overlay | long-loop boundary |
| Pizza `33` | body + apron `263` + hat `424` | dough/hands/hat registration |
| Jackhammer `36` | body + hard hat `403` | tool contact point and phase |
| Propeller `35` | body + cap `407` | semantic 35 versus physical 34 mapping |
| Breakdance `57` | body + boombox `5016` | semantic 57 versus physical 56 mapping |
| Mop `71` | body + item `5084` | bucket/mop phase and loop |

Prefer exact pixel comparison for atlas output produced by the same browser/render backend. If antialiasing varies across platforms, compare premultiplied-alpha images with a very small per-channel threshold and a strict maximum changed-pixel percentage. Store the renderer/browser version with the goldens. Never approve a broad tolerance that can hide a one-pixel registration error.

### Reference acquisition

The strongest reference is the same Project Flipper commit running with the corresponding atlases and a debug frame seek. If that is unavailable, generate expected composites directly from its commit-pinned atlas JSON/PNG files. A screenshot taken after an arbitrary timeout is not an acceptable timing oracle.

### Build validations

- Every generated frame key is unique and parseable.
- Every action's body and overlay sequences have compatible lengths.
- Every verified clothing action has a resolvable frame for every required sequence step, or an explicit documented hold policy.
- Every atlas frame's pivot places its untrimmed origin consistently at container `(0, 0)`.
- Generated JSON is byte-stable for identical inputs.
- Input hashes and upstream SHAs are recorded.

## Acceptance criteria

The alignment work is complete when all of the following are true:

1. A supported penguin composition uses one authoritative 24 FPS playhead.
2. At any render step, body, overlay, and all clothing layers resolve from the same integer sequence index.
3. Runtime layer positions are `(0, 0)`; alignment comes from extracted pivot/source-size metadata, with no unexplained per-item CSS offsets.
4. Depth comes from one slot/type mapping matching Project Flipper's `210..270` policy.
5. Semantic action ID, Island legacy secret frame, and physical SWF root frame are distinct fields with validated mappings.
6. Pizza, jackhammer, propeller, breakdance, and mop pass approved golden checks at the first, second, extreme/mid, last, and wrap frames where applicable.
7. Pausing for at least ten seconds and resuming causes no inter-layer phase change.
8. Repeating an action for at least 100 loops produces no measurable drift or mismatched loop boundary.
9. The special-action resolver reproduces every currently exposed curated composition from Island rules and reports ambiguity deterministically.
10. The generated coverage report distinguishes catalogued, locally available, extractable, and visually verified assets.
11. Unsupported action/item combinations fail visibly in development and are not presented as supported in production.
12. All existing behavioral tests and the new clock, resolver, mapping, and golden tests pass from a clean build.

## Pitfalls and cautions

- **Do not blindly copy Project Flipper's `resume()` method.** At the inspected commit, it resumes body and overlay but calls `pause()` on every clothing animation; this appears to be an upstream typo ([`penguin.ts`, lines 175–185](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/avatar/penguin.ts#L175-L185)). The architecture remains useful; this line should not be reproduced.
- **Do not infer placement from Island's `layer` field.** The rendering reference derives runtime depth from item type. Island's records include a `layer` value, but it is not the Project Flipper `210..270` depth contract.
- **Do not assume missing root frames are corrupt.** Sparse legacy clothing timelines can make a semantic secret frame differ from the source's physical root index. Preserve and test explicit mappings.
- **Do not discard the overlay.** Project Flipper animates body and overlay as separate coordinated layers; omitting overlay can look like an asset-quality or color mismatch.
- **Do not assume all sequences are linear.** Wave deliberately repeats a segment.
- **Do not use Island metadata as proof of art availability.** A catalog rule can exist without a local SWF or extractable frame.
- **Do not compare arbitrary-time screenshots.** They cannot distinguish startup latency, a stable one-frame offset, and accumulated drift.
- **Do not mix penguin animation with world effects.** Snowball flight and pet UI movement should be event-driven from the action timeline, not baked into clothing depth or allowed to control the penguin clock.
- **Mind licensing/provenance.** Record the source commit and asset origin for every generated artifact before distributing converted art.

## Source index

### Local implementation

- [`src/actions.mjs`](../src/actions.mjs) — runtime action behavior and supported directions.
- [`scripts/render-source-manifest.mjs`](../scripts/render-source-manifest.mjs) — build-only SWF sources, layer depths, and composition definitions.
- [`src/penguin-renderer.mjs`](../src/penguin-renderer.mjs) — one playhead and atomic Canvas2D composition.
- [`src/viewer.mjs`](../src/viewer.mjs) — action switching and runtime hookup.
- [`scripts/build-expanded-swfs.mjs`](../scripts/build-expanded-swfs.mjs) — fixed bounds and physical root-frame manifest.
- [`scripts/swf-tools.mjs`](../scripts/swf-tools.mjs) — SWF transformation and root-frame selection.
- [`tests/penguin-renderer.test.mjs`](../tests/penguin-renderer.test.mjs) — current synchronization contract.
- [`tests/render-source-manifest.test.mjs`](../tests/render-source-manifest.test.mjs) — required body and clothing source layers.
- [`tests/swf-tools.test.mjs`](../tests/swf-tools.test.mjs) — physical root-frame transformation checks.

### Project Flipper rendering reference (`1d90cfc`)

- [`src/world/avatar/penguin.ts`](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/avatar/penguin.ts) — container origin, body/overlay, animation metadata, coordinated action start, pause/resume typo.
- [`src/world/engine/clothing/clothingManager.ts`](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/clothing/clothingManager.ts) — clothing loading, depth, `(0,0)` attachment, atlas key parsing, 24 FPS animation creation.
- [`src/world/engine/player/playerManager.ts`](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/player/playerManager.ts) — base body/overlay frame-key generation and 24 FPS settings.
- [`src/world/engine/player/animationFrame.ts`](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/player/animationFrame.ts) — semantic action indices.
- [`src/world/engine/clothing/itemType.ts`](https://github.com/project-flipper/ClubPenguin/blob/1d90cfc13d0c96c6ca686b561c0d08814a7b0da4/src/world/engine/clothing/itemType.ts) — item type enumeration.

### Island metadata reference (`f7368bb`)

- [`web_service/en/paper_items.json`](https://github.com/project-flipper/Island/blob/f7368bba8934ce5c0f94a4d5b5d4ebffd2e76890/web_service/en/paper_items.json) — item IDs, types, labels, and catalog fields.
- [`web_service/en/penguin_action_frames.json`](https://github.com/project-flipper/Island/blob/f7368bba8934ce5c0f94a4d5b5d4ebffd2e76890/web_service/en/penguin_action_frames.json) — equipment combinations, trigger groups, and legacy special/secret frames.
