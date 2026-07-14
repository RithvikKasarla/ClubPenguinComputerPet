# Codex pet signals and a desktop penguin overlay

Research date: 2026-07-14  
Local environment checked: ChatGPT/Codex desktop 26.707.62119, Codex CLI 0.142.4, Electron 42.1.0, GNOME Wayland with X11/Xwayland available.

## Executive recommendation

There are two good product shapes, depending on which tasks the penguin must follow:

1. **Recommended for this Debian setup:** convert the penguin to a Codex custom-pet sprite sheet and let the ChatGPT desktop app provide the state machine and activity tray. Then enable `codex-desktop-linux`'s opt-in `pet-overlay` feature so the existing avatar window receives Linux-specific always-on-top, all-workspace, skip-taskbar, placement, and compositor hints. No signal bridge is needed. The tradeoff is that the documented custom-pet input is a fixed transparent PNG/WebP sprite sheet, not the project's interactive SWF/action runtime.
2. **Keep the richer Club Penguin runtime:** package this project in a small Electron shell and make that shell the client for a `codex app-server` process (or launch work through `codex exec --json`). Normalize Codex lifecycle events into four penguin states. This uses documented programmatic Codex interfaces, but it follows Codex work started through that integration; it does **not** subscribe to the already-running ChatGPT desktop pet.

Do not make direct reads of ChatGPT's SQLite files, private IPC messages, or packaged JavaScript the primary integration. They prove the design is technically possible, but they are private implementation details with update, corruption, privacy, and support risks.

## What the public Codex pet system exposes

The official Pets documentation defines four user-facing states:

| Pet state | Meaning |
| --- | --- |
| Running | A task is actively working. |
| Needs input | A task needs approval, an answer, or another decision. |
| Ready | A task completed and has unread activity. |
| Blocked | A task failed or encountered a system error. |

When several tasks have activity, the documented priority is `Needs input > Blocked > Ready > Running`. The desktop pet floats above other applications, persists its position, opens ChatGPT when clicked, and has a multi-task activity tray. The web pet does not have the floating overlay. Terminal pets report the same four states for the current CLI session only. The IDE extension has no pet overlay. [OpenAI Pets documentation](https://learn.chatgpt.com/docs/pets)

The same documentation offers two supported ways to use our penguin directly:

- **Create your own pet** from **Settings > Pets**; the desktop app installs the bundled `hatch-pet` skill and stores the result locally.
- **Upload pet** as a transparent PNG or WebP sprite sheet that is exactly `1536 x 1872` pixels and at most `20 MiB`.

This repository currently renders prebuilt PNG composition tracks on one Canvas2D playhead and exposes many actions (`penguin`, `walk`, `wave`, `dance`, `jackhammer`, and others). That interactive runtime cannot be uploaded as-is through the documented sprite-sheet interface. [Current action catalog](../src/actions.mjs) and [current runtime command interface](../src/pet-runtime.mjs)

### The custom-pet state contract already matches the question

The first-party `hatch-pet` skill shipped with the installed app defines an 8-column by 9-row atlas (`1536 x 1872`, with `192 x 208` cells). Its rows are:

| Row | Codex state / gesture | Frames used | Club Penguin source candidate |
| ---: | --- | ---: | --- |
| 0 | `idle` | 6 | `idle.swf` |
| 1 | `running-right` (drag motion) | 8 | right-facing frames from `walk.swf` |
| 2 | `running-left` (drag motion) | 8 | left-facing frames from `walk.swf` |
| 3 | `waving` | 4 | `wave.swf` |
| 4 | `jumping` | 5 | derive a clean vertical gesture from an appropriate action |
| 5 | `failed` | 8 | `sledFall`/tumble treatment |
| 6 | `waiting` | 6 | expectant idle or restrained wave |
| 7 | `running` (task work, not locomotion) | 6 | `jackhammer`, `mop`, or another work loop |
| 8 | `review` / ready | 6 | attentive idle, wave, or restrained celebration |

This is a particularly good fit for the current repository: select frames from the existing synchronized PNG compositions, composite them onto transparent `192 x 208` cells, and assemble the atlas. The result goes under `${CODEX_HOME:-$HOME/.codex}/pets/club-penguin/` as `pet.json` plus `spritesheet.webp`. The manifest is small:

```json
{
  "id": "club-penguin",
  "displayName": "Club Penguin",
  "description": "A classic penguin companion for Codex work.",
  "spritesheetPath": "spritesheet.webp"
}
```

After choosing it in **Settings > Pets**, Codex itself maps active work, approvals/questions, unread completion, and failure onto the penguin. This is the literal “pipe the pet signals to our penguin” path: replace the built-in artwork while keeping the built-in signal reducer.

### Important boundary: there is no documented pet-event API

The public Pets page documents visual states and user controls, but no JavaScript API, WebSocket, hook, file, or callback for subscribing to the floating pet's state. Plugins and MCP servers add tools that Codex can call; they are not documented as observers of the desktop app's pet or task lifecycle.

Therefore, **a separate process cannot use a supported API to “listen to the current desktop pet.”** The supported design is to listen to the Codex execution interface that our app owns and independently derive the same four states.

## What `codex-desktop-linux` changes

The installed app was built from [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux) commit [`a8dbcb954f61`](https://github.com/ilysenko/codex-desktop-linux/commit/a8dbcb954f6108070b5633afef69792bf12f5507), wrapper version `0.9.7`, for Debian 13 GNOME Wayland with X11/Xwayland available.

That exact wrapper source includes an opt-in [`linux-features/pet-overlay`](https://github.com/ilysenko/codex-desktop-linux/tree/a8dbcb954f6108070b5633afef69792bf12f5507/linux-features/pet-overlay) feature. It patches the existing Codex avatar window during the normal wrapper build. Its defaults are already what this project wants:

- `alwaysOnTop: true`
- `allWorkspaces: true`
- `skipTaskbar: true`
- transparent rendering with GPU compositing retained
- draggable interactive mode by default, or a non-focusable passive mode
- optional corner gravity and position locking
- targeted Hyprland and Niri handling, with normal Electron/X11 hints elsewhere

It does **not** change the selected pet or install custom artwork. That is useful separation: the Codex custom-pet atlas supplies the penguin, and `pet-overlay` supplies Linux window behavior.

The currently installed build did **not** enable it: `/opt/codex-desktop/.codex-linux/build-info.json` reports `"linuxFeatures": { "enabled": [] }`, and the staged-feature manifest contains no resources or hooks. Enable it in the wrapper checkout before rebuilding:

```json
{
  "enabled": ["pet-overlay"],
  "settings": {
    "pet-overlay": {
      "petOverlay": {
        "alwaysOnTop": true,
        "allWorkspaces": true,
        "skipTaskbar": true,
        "lockPosition": false,
        "mode": "interactive"
      }
    }
  }
}
```

Save that as `linux-features/features.json` in the `codex-desktop-linux` checkout, then rebuild/install through its documented native-package flow (`make install-native`). This step rebuilds and installs a system package, so it should be performed only after reviewing the checkout and its generated package.

On this GNOME session the wrapper normally prefers Xwayland when `DISPLAY` is available, specifically because Electron popup/window positioning is more reliable there. Hyprland and Niri have extra targeted logic; GNOME relies on Electron/X11 window-manager hints, which are not absolute guarantees under every shell extension or fullscreen mode.

## Supported signal sources

### Option A — `codex app-server` (best for a live companion)

OpenAI documents app-server as the interface for rich Codex clients, including authentication, conversation history, approvals, and streamed agent events. It uses JSON-RPC over JSONL stdio by default; localhost WebSocket is available but explicitly experimental and unsupported. A client initializes once, starts or resumes a thread, starts turns, and then consumes notifications such as `thread/status/changed`, `turn/started`, item events, and `turn/completed`. The CLI can generate version-matched TypeScript or JSON Schema bindings. [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server)

For this project, spawn `codex app-server` as a child process and communicate over stdio. That avoids opening a network listener and keeps the penguin and Codex lifecycle together. Generate bindings during development with:

```bash
codex app-server generate-ts --out ./generated/codex-schema
```

The schemas generated by the installed CLI confirm these useful stable-looking events and values:

- `thread/status/changed`: `notLoaded`, `idle`, `systemError`, or `active`.
- Active flags: `waitingOnApproval` and `waitingOnUserInput`.
- Server-to-client requests include `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, and experimental `item/tool/requestUserInput`.
- `turn/completed` has a turn status of `completed`, `interrupted`, or `failed`.

These observations came from schemas generated locally by Codex CLI 0.142.4. Regenerate them when upgrading Codex rather than copying private types from the desktop app.

Suggested normalizer:

| Codex event/state | Penguin state | Current penguin action suggestion |
| --- | --- | --- |
| `active` with `waitingOnApproval` or `waitingOnUserInput`, or an approval/input request | `needs_input` | `wave` plus a badge/pulse |
| `systemError` or `turn/completed` with `failed` | `blocked` | `sledFall` once, then neutral with a red badge |
| `turn/started` or `active` without a waiting flag | `running` | rotate a restrained set such as `jackhammer`, `mop`, or `coffee` |
| Successful `turn/completed` not yet acknowledged | `ready` | `dance` or `wave`; retain a badge until clicked |
| `idle` after acknowledgement | `idle` | `penguin` |

`Ready` is partly a UI concept (“unread activity”), not just a server lifecycle status. The penguin app should maintain its own `unread` bit after successful completion and clear it when the user opens or acknowledges the task.

For multiple threads, apply the official priority order, then use most-recent activity as the tie-breaker. Keep the actual task ID and title alongside the derived visual state so a penguin click can navigate to the right task.

**Scope limitation:** the documented flow starts a new app-server (or connects the Codex CLI TUI to one). It does not document attaching a third-party listener to the ChatGPT desktop app's existing app-server connection or private pet aggregator. Route the tasks that need penguin feedback through the app-server instance owned by the penguin app.

### Option B — `codex exec --json` (simpler launcher, less interactive)

`codex exec --json` emits JSONL lifecycle events including `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`, and `error`. It is a good first milestone if the penguin launches discrete tasks and only needs working/success/failure animation. [Codex non-interactive mode documentation](https://learn.chatgpt.com/docs/non-interactive-mode)

This cannot observe unrelated tasks already running in the desktop app, and approvals are less natural than in an app-server client.

### Option C — Codex SDK

OpenAI's TypeScript SDK can run and resume Codex threads and is documented for integrating Codex into an application. The docs say to use it server-side and require Node.js 18 or later. It is appropriate if we want a higher-level API than raw JSON-RPC, but app-server gives the clearest access to streamed states and approval requests for a desktop companion. [Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk)

## Always-on-top transparent penguin

The current repository is a browser app. A normal browser tab cannot create a transparent, always-on-top, globally positioned desktop window. It needs a native desktop shell.

### Electron is the most direct fit

Electron can reuse the existing HTML, CSS, JavaScript, and Canvas2D renderer. Create one small window around the penguin with these window properties:

```js
new BrowserWindow({
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  focusable: false,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false,
  backgroundColor: "#00000000",
});
```

These are documented [`BaseWindow`/`BrowserWindow` options](https://www.electronjs.org/docs/latest/api/structures/base-window-options). Use [`setAlwaysOnTop(true, "floating")`](https://www.electronjs.org/docs/latest/api/browser-window#winsetalwaysontopflag-level-relativelevel); a normal pet should not use higher levels intended to cover the Dock/taskbar.

Transparent pixels can still create a rectangular click blocker. Electron's [`setIgnoreMouseEvents(true, { forward: true })`](https://www.electronjs.org/docs/latest/api/browser-window#winsetignoremouseeventsignore-options) passes clicks to the application underneath; the `forward` behavior is documented only on macOS and Windows. A robust cross-platform design is:

- default to click-through while the pet is passively animating;
- provide a tray item or global shortcut for a temporary **Interact / Move pet** mode;
- in interact mode, accept dragging/clicks and return to click-through after a short idle timeout;
- keep the native window tightly fitted around the rendered penguin.

Electron also supports [`setVisibleOnAllWorkspaces`](https://www.electronjs.org/docs/latest/api/browser-window#winsetvisibleonallworkspacesvisible-options) on macOS/Linux; it is a no-op on Windows.

### Critical Linux/Wayland constraint

This machine is currently running GNOME Wayland. Electron documents that Wayland does not allow applications to position windows globally; `setPosition`, `getPosition`, and `moveTop` are unsupported. Electron recommends launching under Xwayland (`--ozone-platform=x11`) when those capabilities are required. [Electron platform notices](https://www.electronjs.org/docs/latest/api/browser-window#platform-notices)

That means a freely roaming or edge-snapped penguin should initially target **X11/Xwayland**, even on this Wayland desktop. Native Wayland may still show a window, but arbitrary desktop coordinates and reliable topmost behavior cannot be promised. X11 window-manager “above” and “skip taskbar” states are hints rather than absolute guarantees. [Extended Window Manager Hints specification](https://specifications.freedesktop.org/wm/latest-single/)

### Tauri alternative

Tauri v2 exposes `setAlwaysOnTop`, `setIgnoreCursorEvents`, `setFocusable`, `setSkipTaskbar`, and `setVisibleOnAllWorkspaces` through its window API. [Tauri window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/) Its builder supports transparent, undecorated, always-on-top windows, but macOS transparency requires Tauri's private-API feature, and skip-taskbar/visible-workspace behavior varies by platform. [Tauri `WindowBuilder`](https://docs.rs/tauri/latest/tauri/window/struct.WindowBuilder.html)

Tauri is viable, but Electron is the lower-friction fit here because the project is already JavaScript/web-rendered and Electron offers the documented forwarded mouse-move behavior on macOS/Windows. Tauri's underlying Tao library also documents position and always-on-top limitations on Wayland. [Tao window API](https://docs.rs/tao/latest/tao/window/struct.Window.html)

## What the installed desktop app reveals (reverse-engineered, not an API)

The locally installed `/opt/codex-desktop/resources/app.asar` contains a private avatar overlay implementation. Inspection of version 26.707.62119 shows that it creates frameless, transparent Electron windows, calls `setAlwaysOnTop(true, "floating")`, toggles `setIgnoreMouseEvents`, and maintains private overlay IPC messages. Its bundled renderer maps internal session statuses roughly as follows:

| Private desktop status | Visual class |
| --- | --- |
| `waiting` | warning / highest priority |
| `failed` | danger |
| `review` | success |
| `running` | info |
| `idle` | omitted |

This is useful validation that the proposed Electron architecture matches the first-party implementation. It is **not** permission to depend on those message names or patch the ASAR. The bundle is minified, signatures/names can change on every update, and Linux builds include private platform-specific pointer and window-shape workarounds absent from the public Electron contract.

Likewise, `~/.codex/state_5.sqlite`, logs, session JSONL, and global-state files are private storage. Watching them would risk:

- breakage after migrations or app updates;
- reading partial transactions or WAL state;
- exposing prompts, paths, task content, or credentials beyond what the pet needs;
- racing with the desktop app or corrupting data if anything writes;
- no supported way to mark desktop activity “read” or safely navigate its task.

If a short-lived experiment absolutely must mirror existing desktop tasks, make it a read-only, version-pinned diagnostic behind an explicit feature flag, never the shipped path.

## Proposed component boundary

```text
codex app-server (child process, stdio JSONL)
    -> CodexEventAdapter (generated schema types)
    -> PetStateReducer (priority + unread tracking)
    -> PenguinController (calls runtime.send({ type: "perform", action }))
    -> ElectronOverlayWindow (transparent/topmost/click-through)
```

Keep `PetStateReducer` independent from Electron and Ruffle. It should accept plain domain events and emit a small state object such as:

```ts
type PetState = {
  mode: "idle" | "running" | "needs_input" | "ready" | "blocked";
  threadId: string | null;
  unread: boolean;
  updatedAt: number;
};
```

This separation lets us test all lifecycle and priority transitions without launching a native window, and later swap app-server for another documented event source.

## Practical rollout

1. **Native-pet proof:** export one valid `1536 x 1872` atlas from the current SWFs, install it under `~/.codex/pets/club-penguin/`, refresh **Settings > Pets**, and verify all nine animation rows.
2. **Linux overlay proof:** enable the wrapper's `pet-overlay` feature, rebuild the Debian package, then verify transparency, always-on-top behavior, dragging, and workspace visibility under the current GNOME/Xwayland session.
3. **Only if richer actions are still required:** wrap the existing viewer in a separate Electron overlay; use a tray toggle for click-through and force X11/Xwayland when global positioning is needed.
4. **Signal proof for the separate app:** launch one `codex exec --json` task and map start/success/failure to penguin actions.
5. **Live separate-app integration:** replace the launcher with a stdio app-server client; generate protocol types; add approvals, user-input state, per-thread priority, unread acknowledgement, and crash recovery.

## Bottom line

- For the shortest, most robust path, turn the current Club Penguin art into a Codex custom-pet atlas and enable `codex-desktop-linux`'s existing `pet-overlay` feature. Codex will supply the signals, activity tray, and clicks; the wrapper will supply Linux topmost behavior.
- To keep **every interactive SWF action** rather than the fixed nine-state pet contract, use a separate Electron transparent overlay under X11/Xwayland on the current Linux setup.
- To make it react to Codex using a supported contract, have the penguin app own the Codex session through app-server (preferred) or `codex exec --json` (first milestone).
- To follow **existing ChatGPT desktop tasks**, there is currently no documented public pet signal subscription. Avoid making private IPC/SQLite reverse engineering the product architecture.
