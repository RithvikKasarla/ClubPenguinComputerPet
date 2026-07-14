# Desktop and Codex integration plan

Status: selected architecture implemented as a development vertical slice  
Date: 2026-07-14  
Inputs: [Codex pet integration research](./CODEX_PET_INTEGRATION_RESEARCH.md), [source validation](./CODEX_PET_INTEGRATION_SOURCE_VALIDATION.md), and the current repository

## Selected decision

Build the **standalone Electron companion with manual desktop controls and a
hook-only Codex lifecycle bridge**. Do not expose pet actions to the coding
agent and do not add MCP or app-server in this version.

This matches the clarified ownership model:

- The user directs walking, snowballs, roaming, and named actions through
  global shortcuts and the penguin/tray menus.
- Codex supplies only coarse lifecycle facts: working, waiting for a supported
  permission, and stopped.
- The full existing renderer remains available, including arbitrary action
  animations and movement across the primary desktop work area.
- A deliberate **Tuck Away** never loses the process: `Ctrl+F6`, the tray's **Wake
  Penguin**, or relaunching the single-instance app restores it.

MCP would only be useful if Hermes or another agent should intentionally tell
the penguin what to do. It is unnecessary—and undesirable—for passive Codex
status reflection. App-server is likewise deferred because the pet is not
meant to become a Codex client that owns prompts, approvals, or threads.

The Codex-native atlas remains a possible lightweight edition, but it cannot
host the full interactive renderer or arbitrary animations and is no longer
the primary implementation path. [Official Pets documentation](https://learn.chatgpt.com/docs/pets)

## Implemented development slice

- Full-primary-work-area transparent Electron overlay under X11/Xwayland.
- Narrow preload/IPC bridge; no general renderer code execution.
- `Ctrl+F6` tuck/wake, `Ctrl+F7` action chord, `Ctrl+F8` walk targeting, and
  `Ctrl+F10` snowball targeting, with `F9` deliberately untouched.
- GNOME Wayland owns the four shortcut registrations and forwards fixed local
  commands to the Xwayland companion. This avoids unreliable cross-protocol
  Electron shortcut grabs while Codex is focused. On this backend, `Ctrl+F7`
  opens the native actions menu instead of waiting for a second key.
- A tiny native input window follows the actor: left-click the penguin and then
  a destination to walk; right-click it for the full action menu. The visual
  full-screen overlay stays click-through outside temporary destination mode.
  Target mode becomes focusable only long enough for Xwayland to deliver the
  destination click; it is shown inactive and is never explicitly focused.
- Shortcut and menu snowballs arm the renderer and use the next destination
  click.
- Interruptible lifecycle scheduler: work actions rotate, manual actions take
  temporary priority, permission requests wave, and stopped turns briefly
  dance before returning to idle/roam.
- Hook-only local plugin source with redacted envelopes over a user-only Unix
  socket; prompts, transcripts, tool inputs, and approval payloads are not
  forwarded.
- Single-instance relaunch wakes the existing pet.

Packaging, autostart, persisted preferences, multi-monitor movement, and
explicit user-level plugin installation remain subsequent milestones.

## Why this is the recommended shape

The product goal contains three different meanings of “plug into Codex”: skin the built-in pet, approximately observe existing work, or become a full Codex client.

| Desired behavior | Correct path | Main compromise |
| --- | --- | --- |
| Follow work already running in ChatGPT/Codex desktop | Codex custom-pet sprite sheet | Fixed atlas; no arbitrary runtime actions |
| Preserve the full renderer and approximately react to existing Codex work | Electron plus plugin-bundled hooks | Partial states; not the official pet reducer |
| Launch a simple task and animate start/success/failure | Electron plus `codex exec --json` | Weak interactive approval/input story |
| Act as a small, interactive Codex client | Electron plus `codex app-server` | Larger client, protocol, recovery, and security scope |

The existing research is directionally correct. Four details change the implementation starting point:

- The repository is no longer only a website. It already has an Electron overlay proof, a `codex exec --json` runner, a semantic pet-state reducer, and tests.
- The installed ChatGPT desktop build is `26.707.71524`, not the older build number recorded in the research note. Its Linux wrapper still comes from `codex-desktop-linux` commit `a8dbcb954f61`, and the optional `pet-overlay` feature is present but disabled.
- The original memo omits official lifecycle hooks. Hooks create a supported middle path for approximate signals from existing Codex sessions, although they cannot reproduce all four built-in pet states exactly.
- Rebuilding the Linux wrapper should be a contingency. First test the official floating custom pet on the installed app; enable the wrapper feature only if concrete GNOME/Xwayland acceptance checks fail.

## Current baseline

### Assets worth keeping

- The synchronized PNG-frame renderer and action catalog are the source of truth for the penguin's appearance and gestures.
- `src/pet-runtime.mjs` already exposes a small command contract for actions, walking, snowballs, stopping, and status.
- `src/codex-pet-state.mjs` already models `idle`, `running`, `needs_input`, `ready`, and `blocked`, including the documented cross-task priority order.
- `src/codex-pet-bridge.mjs` already maps semantic state to existing penguin actions.
- `desktop/main.mjs` and `desktop/run-x11.sh` are a working design proof for a frameless, transparent, click-through, always-on-top overlay under Xwayland.
- `desktop/codex-runner.mjs` and `src/codex-exec-jsonl.mjs` are a single-task `codex exec --json` vertical slice.
- The current automated suite passes 90 tests, including controller scheduling,
  IPC configuration, hook redaction, and a real Unix-socket integration test.

### Gaps before this is a product

- Packaging, a desktop entry, autostart, updates, persisted preferences, and a
  clean uninstall flow remain unfinished.
- Plugin installation remains deliberately manual for new machines. It has now
  been installed from the local marketplace and exercised through Codex's
  user-level hook trust UI on the current development machine.
- The initial overlay covers only the primary display work area; persisted
  position and multi-monitor transfer remain future work.
- Ready-state acknowledgement, task navigation, and exact success/failure are
  intentionally absent from hook-only lifecycle signals.
- Native Wayland cannot guarantee arbitrary global positioning. The current
  implementation forces X11/Xwayland for roaming behavior. [Electron platform notices](https://www.electronjs.org/docs/latest/api/browser-window#platform-notices)
- A standalone process still has no supported way to observe the existing
  ChatGPT desktop pet reducer or task aggregator.

## Phased plan

Each phase ends at a decision gate. Do not start the next phase merely because the preceding code exists; first verify its acceptance criteria on the target desktop.

### Phase 0 — Freeze the product contract

Decide and record:

- Initial scope is this Debian 13, GNOME Wayland host with Xwayland available.
- Whether the first deliverable must follow existing ChatGPT desktop tasks or preserve the full interactive action catalog. The recommendation is existing-task coverage first, rich runtime second.
- The public source repository excludes Club Penguin artwork and generated frames. Any packaged binary that embeds those assets still requires a separate rights review before distribution.
- The five semantic states remain `idle`, `running`, `needs_input`, `ready`, and `blocked`. Codex exposes four active user-facing states; `idle` is the local no-activity fallback.
- No private ChatGPT IPC, direct app-bundle patching, SQLite polling, session-file watching, or credential scraping is an accepted integration dependency. The optional third-party wrapper patch remains a separately pinned deployment contingency, never the signal boundary.

Exit when the first deliverable and distribution boundary are explicit.

### Phase 1 — Codex-native pet vertical slice

Build the lowest-risk answer to “make our penguin sit on the desktop and plug into Codex”:

1. Start the desktop **Create your own pet** flow so the current bundled `hatch-pet` skill is installed, then inspect its current atlas contract. The public docs fix the file dimensions and size, but the exact 8 × 9 cell layout and manifest details are version-pinned implementation observations rather than a stable public API.
2. Define a frame-selection sheet for the current atlas rows using the existing render-frame catalog.
3. Choose restrained loops for task work and waiting; reserve larger gestures for ready and failure so the pet is pleasant during long sessions.
4. Produce one transparent PNG or WebP with the documented exact dimensions and size limit.
5. Install it through the desktop `hatch-pet` flow. If the installed build also exposes **Upload pet**, validate that UI locally; the public upload instructions are documented under the web-pet flow and should not be assumed to exist on every desktop build.
6. Select it, wake it with `/pet`, and exercise running, needs-input, ready, blocked, multi-task priority, click-to-open, activity tray, drag persistence, app restart, and reduced-motion behavior.
7. Test on the current GNOME session before changing the Linux wrapper.

Acceptance criteria:

- No clipping, frame bleed, opaque background, scale jump, or registration-point wobble in any row.
- The correct visible behavior appears for each Codex state and for competing tasks.
- Pet click and activity selection return to the correct task.
- Position survives app restart.
- CPU use remains quiet while idle and acceptable while animating.
- Reduced-motion mode has an intentional still frame.

Decision gate:

- If the atlas preserves enough personality, make this the primary Codex integration and keep the standalone app optional.
- If fixed rows erase the reason for the project, keep the atlas as a lightweight edition and proceed to Phase 3 for the rich companion.

### Phase 2 — Linux overlay contingency

Only enter this phase if Phase 1 shows a specific Linux window-management failure.

1. Record the failed behavior and compositor/session details before changing the wrapper.
2. Confirm whether the wrapper's already-applied core avatar patch provides enough always-on-top, skip-taskbar, focus, and pointer behavior; then review the pinned `codex-desktop-linux` checkout and enable only its opt-in `pet-overlay` feature if more is required.
3. Start with interactive mode, unlocked position, bottom-right gravity, 24-pixel margin, always-on-top, all workspaces, and skip-taskbar.
4. Rebuild/install through the wrapper's normal native-package flow.
5. Repeat Phase 1's desktop acceptance matrix after every ChatGPT desktop or wrapper update.

Treat the third-party wrapper feature as a version-pinned compatibility layer, not an OpenAI-supported Codex API. Its patch can drift when the upstream Electron bundle changes, and GNOME may still interpret window-manager hints differently from other compositors.

Exit when the official pet is usable on this host, or when the limitation is documented and accepted without further patching.

### Phase 3 — Standalone desktop companion hardening

This phase turns the existing proof into an independently installable desktop app. It does not add deep Codex behavior yet.

1. Give the project its own pinned Electron runtime and reproducible package metadata. Do not depend on `/opt/codex-desktop/electron`.
2. Separate main, preload, and renderer responsibilities. Load only packaged local content, reject unexpected navigation and new windows, expose only the small pet command/status contract over validated IPC, and remove general `executeJavaScript` calls from the host.
3. Tighten the native window around the rendered actor or dynamically update the input region so interact mode does not block a large invisible rectangle.
4. Keep click-through as the passive default. Make interaction a deliberate tray/shortcut mode with obvious state and automatic escape back to passive mode.
5. Persist display, position, scale, and mode. Clamp stale positions after monitor changes, resolution changes, or unplugged displays.
6. Keep Xwayland as the supported roaming mode on this machine. Detect and explain unsupported native-Wayland positioning rather than silently degrading.
7. Add packaging, an application icon, desktop entry, optional autostart, single-instance behavior, logs, and a clean uninstall story.
8. Measure idle/active CPU and memory with background throttling choices documented.

Acceptance criteria:

- The pet launches from the desktop without a development server or installed Codex Electron binary.
- It remains transparent, above normal windows, absent from the task switcher, and visible on intended workspaces.
- Passive mode never steals focus or blocks clicks; interactive mode can move and control the pet.
- Monitor and session changes cannot strand the window off-screen.
- A renderer crash or malformed command cannot crash-loop the desktop session.

### Phase 4 — Supported Codex signal integration

Choose exactly one subphase first.

#### Phase 4A — Simple launcher with `codex exec --json`

Build on the existing vertical slice when the pet only needs to launch discrete, mostly non-interactive work.

1. Preserve the read-only sandbox default and require an explicit user choice for write-enabled tasks.
2. Normalize only documented JSONL events and treat unknown events as ignorable telemetry, not fatal protocol violations.
3. Distinguish process failure, Codex-reported failure, interruption, and successful completion.
4. Wire ready acknowledgement to a real click or tray action.
5. Show task title and last outcome outside the animation so the penguin is not the only error channel.
6. Keep one owned task at a time until cancellation and shutdown behavior are reliable.

Use this path for the first standalone Codex demonstration. Do not stretch it into an approval-rich client.

#### Phase 4B — Approximate existing-task signals with hooks

Choose this path when keeping the full renderer matters more than exactly matching the built-in pet reducer.

1. Package the bridge as a small Codex plugin with trusted lifecycle hooks rather than asking users to hand-edit global hook configuration.
2. Use `UserPromptSubmit` as a best-effort running signal, `PermissionRequest` as a needs-input signal for supported approvals, and `Stop` as an end-of-turn signal.
3. Send only a minimal event envelope to the local companion: hook name, `session_id`, `turn_id` when present, timestamp, and workspace identifier if needed. Do not forward transcripts, prompts, tool inputs, or approval payloads.
4. Use a bounded local transport such as a user-only Unix socket. The hook must exit quickly and successfully when the companion is absent so the pet can never block Codex work.
5. Require normal Codex hook review and trust. Never bypass the trust flow in installation instructions.
6. Give hook-derived state its own reducer policy. Do not label `Stop` as a verified success, invent `blocked` from missing events, or assume every user question fires `PermissionRequest`.
7. Keep `ready` as a local “turn stopped and not yet acknowledged” approximation, visibly distinct from a confirmed app-server completion if both sources ever coexist.
8. If a hook session can be mapped to a documented task deep link, let a pet click open that task; otherwise open the ChatGPT app without guessing an identifier.

Acceptance criteria:

- Hooks fire in the installed desktop app, CLI, and IDE surfaces that the product claims to support.
- A missing or crashed companion adds negligible latency and never changes Codex behavior.
- The UI labels the hook integration as approximate and never claims confirmed success or failure without evidence.
- Plugin updates trigger the expected hook trust review, and disabling the plugin removes the bridge cleanly.

Do not combine hook events with private session transcripts to fill the missing states. The hook documentation explicitly says transcript format is not stable.

#### Phase 4C — Rich client with `codex app-server`

Move here only if the companion should accept prompts, surface approvals, resume threads, or aggregate multiple pet-owned tasks.

1. Spawn `codex app-server` as a child process and use the default JSONL stdio transport. Use a local Unix socket only if the overlay and Codex host need separate lifetimes; avoid the experimental WebSocket transport for the initial product.
2. Generate TypeScript or JSON Schema bindings from the installed Codex CLI and regenerate them on every supported CLI upgrade.
3. Implement the initialize/initialized handshake, thread start/resume, turn start/interrupt, streamed notifications, server requests, and graceful shutdown.
4. Normalize protocol messages into the existing semantic reducer. Keep app-server types out of the renderer and Electron window code.
5. Treat approval and user-input requests as real UI states, not merely a waving animation. The user must be able to inspect the request and respond or decline.
6. Maintain per-thread state and derive the visible pet with the documented priority `needs_input > blocked > ready > running` and recency as the tie-breaker.
7. Maintain the local unread bit that turns a successful completion into `ready`; clear it only on explicit acknowledgement or navigation.
8. Define reconnect and crash semantics: orphaned child process, partial JSONL, CLI upgrade mismatch, expired auth, interrupted turn, and app restart.
9. Identify the client honestly through app-server client metadata and preserve Codex sandbox/approval controls.

Acceptance criteria:

- Running, approval/input, success/unread, failure, interruption, and recovery each have deterministic state transitions.
- Multiple pet-owned tasks obey the same visible priority as the official pet.
- No prompt, task content, approval payload, or credential is written to pet logs by default.
- The app does not claim to observe tasks owned by the ChatGPT desktop app.

### Phase 5 — Product polish and release gate

1. Run accessibility checks: reduced motion, keyboard-only interaction, focus behavior, visible non-animation status, and screen-reader labels for controls.
2. Add animation pacing rules so long-running work does not loop the loudest action indefinitely.
3. Test suspend/resume, lock/unlock, logout, Codex auth expiry, app update, CLI update, compositor restart, and multi-monitor hotplug.
4. Separate user settings from generated artwork and task state; make reset/recovery safe.
5. Keep media out of the public source tree, and complete the rights/distribution review before publishing any package that embeds Club Penguin artwork.
6. Document the supported matrix: OS, desktop environment, Xwayland requirement, ChatGPT desktop build if using the wrapper, Codex CLI range, and known compositor limitations.

Release only after the selected path passes its acceptance criteria without relying on private ChatGPT storage or IPC.

## Target architectures

The native path ends at the Codex pet system and does not use this project's reducer:

```text
existing render frames -> version-pinned atlas exporter -> ChatGPT custom pet
```

The rich companion uses one explicit signal source:

```text
one supported signal source
  trusted lifecycle hooks (approximate existing-task edition), or
  companion-owned `codex exec` / `codex app-server` (client edition)
        |
        v
source-specific, version-aware adapter
        |
        v
semantic pet-state reducer
  idle | running | needs_input | ready | blocked
        |
        v
action policy + acknowledgement policy
        |
        v
validated Electron IPC
        |
        v
existing penguin runtime and renderer
```

The reducer is the seam to protect. Codex protocol or hook changes belong above it; animation and Electron changes belong below it. Each source needs an explicit fidelity label because a hook-derived `ready` is not equivalent to an app-server-confirmed completion. This lets the custom-pet atlas, hook bridge, exec launcher, and a later app-server client share vocabulary without sharing fragile implementation details.

## Risks and guardrails

| Risk | Guardrail |
| --- | --- |
| Assuming hook signals equal the official pet reducer | Label hook state as approximate; use the Codex-native pet for exact existing-task behavior |
| Private IPC/database coupling | Exclude it from the supported architecture and release checklist |
| Hooks delaying or changing Codex work | Minimal redacted payload, short local delivery, fail open when the companion is unavailable, normal trust review |
| Codex protocol drift | Generate version-matched app-server bindings; fixture-test recorded public events; fail with a useful compatibility message |
| Wayland positioning limits | Support Xwayland for roaming; detect native Wayland; do not promise global coordinates there |
| Focus stealing and click blocking | Passive click-through default, tight window/input region, explicit temporary interaction mode |
| Wrapper update drift | Use it only after a reproduced failure, pin the source commit, and rerun acceptance tests after updates |
| Excessive permissions | Read-only default, explicit write opt-in, preserve approvals, never infer a broader sandbox from the animation state |
| Sensitive logs | Log protocol categories and identifiers only by default; redact prompts, tool payloads, and credentials |
| Artwork distribution rights | Fetch ignored development inputs from the documented archive; review rights or replace artwork before distributing a packaged binary |
| Battery/CPU cost | Measure idle and active use; use restrained loops and intentional throttling rather than permanently maximal frame activity |

## Final recommendation

The next implementation milestone should be the **Codex-native sprite-sheet proof**, because it is the smallest supported route to “our penguin on the desktop reacting to Codex,” including exact task status already in the ChatGPT app. Do not rebuild the Linux wrapper until that proof exposes a real compositor problem.

Keep the existing Electron/`codex exec` work as the start of a separate **rich companion** edition. Once the overlay is independently packaged and stable, use a plugin-bundled hook bridge as the next experiment if approximate reactions to existing Codex work are valuable. If that edition needs exact outcomes, approvals, input, and multi-thread recovery, graduate it to app-server and let it own those Codex threads. This sequencing preserves the full renderer without making private ChatGPT internals or a system-app patch the foundation of the product.
