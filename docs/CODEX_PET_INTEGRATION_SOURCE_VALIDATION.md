# Codex pet integration: primary-source validation

Research date: 2026-07-14  
Document audited: [`CODEX_PET_INTEGRATION_RESEARCH.md`](./CODEX_PET_INTEGRATION_RESEARCH.md)

## Conclusion

The research memo's main product split is sound: use Codex's built-in custom-pet system when a fixed Codex-controlled companion is enough, and use a separate desktop shell plus a documented Codex execution interface when the existing interactive penguin runtime must remain intact. The memo is also right not to make private desktop IPC, ASAR internals, SQLite, or transcript files the product boundary.

Four material corrections should change the plan:

1. **There is now a supported middle integration option: lifecycle hooks.** A plugin-bundled hook can report selected events from work launched in Codex desktop, CLI, or the IDE. This is an approximate bridge, not a complete pet-state API. [`UserPromptSubmit`](https://learn.chatgpt.com/docs/hooks#userpromptsubmit) can indicate work beginning, [`PermissionRequest`](https://learn.chatgpt.com/docs/hooks#permissionrequest) can indicate supported approval prompts, and [`Stop`](https://learn.chatgpt.com/docs/hooks#stop) indicates that a main turn stopped. `Stop` does not identify success versus failure, `PermissionRequest` does not cover every kind of user question, and `Ready` still needs a local unread bit. The memo's blanket statement that plugins cannot observe lifecycle activity is therefore stale; MCP by itself is not an observer, but a plugin may bundle hooks. [Hooks](https://learn.chatgpt.com/docs/hooks), [plugin structure](https://learn.chatgpt.com/docs/build-plugins#plugin-structure)
2. **The exact custom-pet atlas contract is version-pinned, not a public stable API.** Public docs establish the four display states, custom-pet creation, and the web upload size/type limit, but they do not publish the 8-by-9 row semantics, `192 x 208` cells, manifest fields, or `${CODEX_HOME}/pets/...` layout. Those details may be correct observations from the bundled `hatch-pet` skill, but the plan should re-inspect and validate them after Codex upgrades. [Pets](https://learn.chatgpt.com/docs/pets)
3. **The optional Linux `pet-overlay` patch should be a contingency, not the foundation.** The installed wrapper already applies a core Linux avatar patch that adds `alwaysOnTop`, `skipTaskbar`, focusability, and pointer-interactivity handling. The optional feature adds stronger workspace, placement, transparency, and compositor-specific behavior, but it patches a minified upstream desktop bundle and explicitly carries Wayland risk. [Core avatar patch at the installed wrapper commit](https://github.com/ilysenko/codex-desktop-linux/blob/a8dbcb954f6108070b5633afef69792bf12f5507/scripts/patches/impl/avatar-overlay.js), [optional feature README](https://github.com/ilysenko/codex-desktop-linux/blob/a8dbcb954f6108070b5633afef69792bf12f5507/linux-features/pet-overlay/README.md)
4. **The local version snapshot in the memo is already stale.** The current installed build reports ChatGPT/Codex desktop `26.707.71524`, not `26.707.62119`. It still reports wrapper `0.9.7` at commit `a8dbcb954f61`, Electron `42.1.0`, and Codex CLI `0.142.4`. Any plan that depends on generated schemas or wrapper patch needles must record and re-check versions at each milestone.

## Claim audit

| Claim in the memo | Verdict | Validation or correction |
| --- | --- | --- |
| Desktop pets expose `Running`, `Needs input`, `Ready`, and `Blocked`, prioritized in that order: needs input, blocked, ready, running. | Supported | The official Pets page defines the four states, unread semantics for `Ready`, the priority order, the floating desktop overlay, task tray, click behavior, and persisted position. [Pets](https://learn.chatgpt.com/docs/pets#understand-pet-status) |
| Web pets do not float; terminal pets cover the current CLI session; the IDE has no pet overlay. | Supported | The web pet lacks the desktop overlay and activity tray; terminal pets use the same four states for one CLI session; the IDE has no picker or overlay. [Web pet](https://learn.chatgpt.com/docs/pets#choose-a-pet-on-the-web), [terminal pet](https://learn.chatgpt.com/docs/pets#choose-a-terminal-pet), [IDE boundary](https://learn.chatgpt.com/docs/pets#pets-in-the-ide-extension) |
| Desktop custom-pet creation installs `hatch-pet` and stores the result locally. | Supported | This is the documented desktop flow. [Create a custom pet](https://learn.chatgpt.com/docs/pets#create-a-custom-pet) |
| Upload accepts transparent PNG/WebP, exactly `1536 x 1872`, at most `20 MiB`. | Supported, but web-scoped | The official upload section sits under the web-pet flow. Do not present it as a guaranteed desktop upload control; the documented desktop flow is `hatch-pet`. [Upload a custom pet](https://learn.chatgpt.com/docs/pets#upload-a-custom-pet) |
| The 8-column by 9-row atlas, exact row meanings/frame counts, `pet.json` fields, and local directory layout form a stable custom-pet API. | Not publicly established | These are useful installed-skill observations, not a published compatibility contract. Keep them in a versioned adapter/export note, validate a generated pet in the current app, and expect drift. [Public Pets contract](https://learn.chatgpt.com/docs/pets) |
| There is no documented API to subscribe to the built-in desktop pet reducer. | Supported | The Pets docs expose status semantics and user controls, not a callback, socket, or subscription API. Official app-server docs describe subscriptions on the app-server instance a client connects to; they do not document attaching to the desktop app's private pet aggregator. [Pets](https://learn.chatgpt.com/docs/pets), [app-server subscriptions](https://learn.chatgpt.com/docs/app-server#api-overview) |
| Plugins and MCP cannot help with lifecycle observation. | Needs reframing | MCP tools are not a passive lifecycle stream. Plugins, however, can bundle official lifecycle hooks. Hooks are partial: they do not expose the built-in pet's exact reducer or final success/failure at `Stop`. [Plugin overview](https://learn.chatgpt.com/docs/plugins#overview), [Hooks](https://learn.chatgpt.com/docs/hooks) |
| `codex app-server` is the best documented interface for a rich Codex client. | Supported | OpenAI explicitly positions app-server for deep product integration with authentication, history, approvals, and streamed events. [Codex app-server](https://learn.chatgpt.com/docs/app-server) |
| App-server defaults to JSONL over stdio; WebSocket is experimental and unsupported; generated bindings are version-specific. | Supported, with an addition | The docs now also support a Unix-socket transport. Prefer stdio for a child process or a local Unix socket when process separation is useful. Do not base the first version on WebSocket. Regenerate TypeScript or JSON Schema bindings for the installed CLI version. [Protocol](https://learn.chatgpt.com/docs/app-server#protocol) |
| App-server exposes enough lifecycle state to drive a pet. | Supported | Documented state includes `notLoaded`, `idle`, `systemError`, and `active` with flags; `thread/status/changed` includes an example with `waitingOnApproval`; `turn/completed` reports `completed`, `interrupted`, or `failed`. `waitingOnUserInput` appears in locally generated schemas but is not named in the public prose, so consume it through generated version-matched types rather than treating it as a permanent string. [Stored thread status](https://learn.chatgpt.com/docs/app-server#read-a-stored-thread-without-resuming), [status changes](https://learn.chatgpt.com/docs/app-server#track-thread-status-changes), [turn events](https://learn.chatgpt.com/docs/app-server#turn-events) |
| A separately launched app-server can subscribe to the already-running desktop app's live tasks. | Not supported | A client receives events for threads on the app-server connection it initializes and subscribes to. No official page documents attaching a third-party listener to the desktop app's existing process/connection. A separate app-server may list persisted threads, but that is not the same as receiving another process's live runtime state. [App-server lifecycle](https://learn.chatgpt.com/docs/app-server#lifecycle-overview), [thread APIs](https://learn.chatgpt.com/docs/app-server#api-overview) |
| `codex exec --json` is a reasonable first signal proof for work the pet launches. | Supported | It emits JSONL events including `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`, and `error`. It does not make unrelated desktop activity observable. [Machine-readable non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode#make-output-machine-readable) |
| The SDK is a higher-level alternative requiring server-side Node 18+. | Supported but incomplete | The TypeScript SDK is server-side and requires Node 18+, and the current docs also publish a beta Python SDK that controls local app-server. App-server remains the clearer documented fit for a rich interactive client; the SDK is a viable higher-level adapter and is explicitly recommended for automation/CI. [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [app-server positioning](https://learn.chatgpt.com/docs/app-server) |
| A custom overlay can open its associated desktop task when clicked. | Supported | `codex://threads/<thread-id>` is an official deep link for local tasks. [Supported Codex links](https://learn.chatgpt.com/docs/reference/commands#supported-links) |
| Private ASAR IPC, SQLite, global-state fields, and transcript formats are acceptable product contracts. | Not supported | The memo correctly rejects them. Even the public hook docs warn that `transcript_path` points to a format that is not stable. Do not read transcript contents for pet signaling. [Hook input boundary](https://learn.chatgpt.com/docs/hooks#common-input-fields) |

## Revised integration choices

### 1. Built-in custom pet: lowest-risk first experiment

This is the best first proof if nine fixed animations are acceptable. Codex owns multi-task aggregation, approvals, unread completion, failure, task navigation, and persistence; this project supplies appearance only. The public contract is the four displayed states and the supported custom-pet workflow. Treat the exact atlas row layout as a version-specific exporter target, not a domain API. [Pets](https://learn.chatgpt.com/docs/pets)

This proof should run against the existing installed wrapper before enabling `pet-overlay`. The wrapper's core patch already applies key Linux avatar window behavior. Only add the optional feature if testing shows a concrete gap such as cross-workspace visibility, corner locking, or GNOME/compositor behavior that the optional patch improves. The feature is third-party wrapper functionality, not an OpenAI-supported Codex extension. [Wrapper Linux features](https://github.com/ilysenko/codex-desktop-linux/blob/a8dbcb954f6108070b5633afef69792bf12f5507/linux-features/README.md), [pet-overlay feature](https://github.com/ilysenko/codex-desktop-linux/blob/a8dbcb954f6108070b5633afef69792bf12f5507/linux-features/pet-overlay/README.md)

### 2. Separate overlay plus plugin-bundled hook bridge: supported, approximate mirroring

This is the missing middle option when the richer penguin should react to work launched in existing Codex clients. Package trusted hooks for `UserPromptSubmit`, `PermissionRequest`, and `Stop`; emit only minimal identifiers and event kinds to the local companion; discard prompt text and never read the transcript. Hooks include `session_id` and turn-scoped `turn_id`, and plugins may bundle hook configuration. Non-managed hooks require explicit review/trust, and an administrator can disable non-managed hooks. [Hook event and trust model](https://learn.chatgpt.com/docs/hooks), [plugin-bundled hooks](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks)

The reducer must label its states as approximate:

| Hook event | Safe inference | Missing information |
| --- | --- | --- |
| `UserPromptSubmit` | `running` | A blocked prompt may never start; there is no subsequent exact active flag. |
| `PermissionRequest` | `needs_input` | Only supported approval paths; not every user-question path. |
| `Stop` | locally mark `ready`/unread | No completed-versus-failed outcome, so it cannot reliably produce `blocked`. |

This option can react across supported Codex surfaces without owning each app-server turn, but it cannot truthfully claim parity with the native pet.

### 3. Separate overlay plus app-server: strongest full product boundary

Use this when the companion should launch/resume Codex work, handle approvals and input, distinguish failure, show multiple owned threads, and retain all interactive penguin actions. Keep a small event adapter around generated app-server types and an application-owned reducer around the five local display modes: `idle`, `running`, `needs_input`, `ready`, and `blocked`. `Ready` is explicitly a UI/unread concept, so the app must set and clear it itself. [App-server](https://learn.chatgpt.com/docs/app-server), [Pets status semantics](https://learn.chatgpt.com/docs/pets#understand-pet-status)

The initial transport should be a child `codex app-server` over stdio. A Unix socket is the next option if the overlay and Codex host need separate lifetimes. Use `codex exec --json` only for the earliest discrete-task proof. This architecture covers work routed through the companion-owned app-server, not arbitrary tasks already executing inside the ChatGPT desktop app. [App-server protocol](https://learn.chatgpt.com/docs/app-server#protocol), [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode#make-output-machine-readable)

## Electron and Linux validation

Electron is still the lowest-friction shell for this repository because it can host the existing local HTML/JavaScript/Canvas renderer. The proposed frameless, transparent, non-resizable window is supported, and Electron exposes always-on-top, skip-taskbar, focusability, all-workspace visibility, and mouse-event passthrough. [Custom window styles](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles), [BrowserWindow APIs](https://www.electronjs.org/docs/latest/api/browser-window), [BaseWindow options](https://www.electronjs.org/docs/latest/api/structures/base-window-options)

The memo should strengthen three constraints:

- Transparent pixels are not automatically click-through, and Electron says transparent windows should not be resizable. `setIgnoreMouseEvents` passes mouse events to the window below, but its `forward` option is documented only for macOS and Windows. On Linux, plan a small window shape and an explicit interaction/move mode; do not depend on forwarded hover events. [Transparent-window limitations](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#limitations), [`setIgnoreMouseEvents`](https://www.electronjs.org/docs/latest/api/browser-window#winsetignoremouseeventsignore-options)
- Native Wayland generally prevents programmatic global positioning, movement, focus, blur, and some post-creation resizing. Electron explicitly recommends Xwayland with `--ozone-platform=x11` when those capabilities are required. A freely positioned desktop pet should make X11/Xwayland an explicit launch requirement for its first Linux release, not an ambient assumption. [Electron platform notices](https://www.electronjs.org/docs/latest/api/browser-window#platform-notices)
- A desktop shell has materially more authority than the browser app. Load packaged local content, keep renderer sandboxing and context isolation enabled, keep Node integration out of the renderer, expose a narrow validated preload API, and reject unexpected navigation/windows. [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

EWMH `ABOVE`, `STICKY`, and `SKIP_TASKBAR` are window-manager requests, not cross-compositor guarantees. This supports the memo's warning that topmost/workspace behavior must be verified on the target compositor. [Extended Window Manager Hints](https://specifications.freedesktop.org/wm/latest-single/)

## Installed `codex-desktop-linux` validation

The installed package's primary artifacts currently report:

- desktop app `26.707.71524`;
- Electron `42.1.0`;
- wrapper `0.9.7`, commit `a8dbcb954f6108070b5633afef69792bf12f5507`;
- Codex CLI `0.142.4`;
- GNOME Wayland, X11 available, one connected DRM display;
- no optional Linux features staged;
- the core `linux-avatar-overlay-mouse-passthrough` patch applied.

The exact wrapper source supports the memo's description of the optional `pet-overlay` defaults: always-on-top, all workspaces, skip taskbar, unlocked manual placement, interactive mode, plus targeted Hyprland and Niri handling. Its own README says Wayland compositors may reject positioning, workspace visibility, or z-order changes. [Feature manifest](https://github.com/ilysenko/codex-desktop-linux/blob/a8dbcb954f6108070b5633afef69792bf12f5507/linux-features/pet-overlay/feature.json), [feature README](https://github.com/ilysenko/codex-desktop-linux/blob/a8dbcb954f6108070b5633afef69792bf12f5507/linux-features/pet-overlay/README.md)

Two memo statements need correction:

- Enabling `pet-overlay` is not required merely to get always-on-top, skip-taskbar, or Linux pointer handling; the wrapper's core avatar patch already adds those. Enable the optional feature only after a baseline test identifies a need for its additional behavior. [Core avatar implementation](https://github.com/ilysenko/codex-desktop-linux/blob/a8dbcb954f6108070b5633afef69792bf12f5507/scripts/patches/impl/avatar-overlay.js)
- Do not assume this installation "normally prefers Xwayland whenever `DISPLAY` is available." The packaged launcher starts from an automatic Ozone hint and forces X11 for specific profiles such as WSLg or detected GNOME Wayland multi-monitor sessions, as well as explicit `--x11`/environment overrides. This machine currently reports one connected display, so a separate overlay that requires coordinates should explicitly request X11/Xwayland. [Installed-commit launcher](https://github.com/ilysenko/codex-desktop-linux/blob/a8dbcb954f6108070b5633afef69792bf12f5507/start.sh)

Because the wrapper works by patching the upstream packaged desktop app, it should remain a tested deployment aid, not the integration seam. A future upstream bundle change can invalidate patch needles even when the pet assets and Codex protocol remain valid.

## Major risks to carry into the plan

1. **Signal coverage:** built-in pets have exact native state; hooks have approximate cross-client state; app-server has rich exact state only for work on the connected server. Do not blur these promises. [Pets](https://learn.chatgpt.com/docs/pets), [Hooks](https://learn.chatgpt.com/docs/hooks), [app-server](https://learn.chatgpt.com/docs/app-server)
2. **Protocol and asset drift:** generated app-server schemas are version-specific, public docs distinguish stable and experimental fields, and the detailed custom-pet atlas layout is not publicly versioned. Pin, generate, validate, and retest on upgrade. [App-server schema generation](https://learn.chatgpt.com/docs/app-server#message-schema), [experimental API opt-in](https://learn.chatgpt.com/docs/app-server#experimental-api-opt-in)
3. **Wayland behavior:** native Wayland cannot promise arbitrary global positioning; compositor hints remain best-effort. Start the separate overlay under Xwayland when placement matters. [Electron platform notices](https://www.electronjs.org/docs/latest/api/browser-window#platform-notices)
4. **Hook trust and privacy:** plugin hooks require review/trust and may be disabled by policy. Hook input can contain prompt text and a transcript path; transmit only event type and opaque IDs, and do not parse transcripts. [Hooks trust model](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks), [common input fields](https://learn.chatgpt.com/docs/hooks#common-input-fields)
5. **Desktop security:** Electron turns a browser-rendered pet into a privileged local application. Keep Codex process control in the main process, isolate the renderer, and expose only narrow IPC. [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
6. **Third-party wrapper maintenance:** `codex-desktop-linux` is not an OpenAI-supported extension surface, and its optional feature patches upstream bundle internals. Test it per desktop release and preserve a path that works without it.

## Source-backed recommendation

Sequence the work as three independent decisions, not one escalating implementation:

1. Validate a built-in custom penguin against the current app, using the bundled exporter contract as version-pinned input. Test the wrapper's baseline pet first; treat `pet-overlay` as a contingency.
2. If the full interactive runtime is required and approximate reactions to existing Codex tasks are useful, prove the hook bridge next. Call it approximate and avoid prompt/transcript data.
3. If the companion must be a dependable Codex client with exact approval, failure, streaming, and multi-thread behavior, make a separate Electron/Xwayland app own an app-server connection. Use official task deep links for handoff back to ChatGPT.

This preserves the memo's strongest architectural boundary while adding the one current supported integration surface it missed: hooks.
