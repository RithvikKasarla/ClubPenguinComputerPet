# Desktop penguin

The desktop host opens the existing renderer in a frameless, transparent,
always-on-top window covering the primary display's work area. The visual
window remains click-through while a second, tiny transparent native input
window follows only the penguin's current hitbox. Movement therefore crosses
the whole screen without turning the whole desktop into an input surface.

Left-click the penguin, then click a desktop location to walk there. Right-click
the penguin for its menu. On X11, ordinary clicks made directly on that small
actor hitbox necessarily belong to the companion; every other transparent area
continues to pass through to the application beneath it.

## Launch on Linux

The first Linux target uses X11/Xwayland for dependable desktop coordinates:

```bash
npm install
npm run build
npm run desktop
```

The build downloads hash-pinned runtime artwork into the ignored `assets/`
tree; see the repository's [asset setup](../README.md#set-up) for provenance.

On GNOME Wayland, install the companion's desktop-level shortcuts once:

```bash
npm run desktop:shortcuts:install
```

GNOME owns those bindings, so they continue to work while a native Wayland
window such as Codex is focused. They send only a fixed action name to the
running companion over its user-only local socket. Remove them with
`npm run desktop:shortcuts:remove`; installation and removal preserve unrelated
custom shortcuts.

The installer also maps `Ctrl` plus the keyboard's Settings/Tools media key to
tuck/wake. This machine emits that media key instead of a normal `F6` unless
the keyboard's function mode is changed.

The helper uses `ELECTRON_BIN` when set, then a project-local Electron, an
`electron` on `PATH`. The project pins its own Electron dependency; the
installed Codex desktop executable is intentionally not used because it
launches the Codex application rather than acting as a generic runtime.

## Controls

| Control | Behavior |
| --- | --- |
| `Ctrl+F6` | Tuck away or wake the penguin. |
| `Ctrl+F7` | Open the actions menu on GNOME Wayland; elsewhere, press an action letter next. |
| Left-click penguin, then click | Walk to the chosen location. |
| `Ctrl+F8` | Arm walking; click the destination next. |
| `Ctrl+F10` | Arm a snowball; click its destination next. |

Action chords:

| Key | Action |
| --- | --- |
| `J` | Jackhammer |
| `M` | Mop |
| `W` | Wave |
| `D` | Dance |
| `C` | Coffee |
| `P` | Pizza |
| `B` | Breakdance |
| `G` | Guitar |
| `H` | Hula |

`F9` is left completely untouched. The tray menu exposes every non-targeted
animation and arms its snowball for the next destination click.
Right-click the visible penguin for the menu. Global shortcuts are defaults and
must remain configurable because a desktop environment or keyboard firmware may
reserve individual function keys.

Autonomous roaming is available from the penguin's right-click menu rather than
a keyboard shortcut.

Both native companion windows are non-focusable during ordinary use. Clicking
the penguin arms a target without the old explicit focus jump; the full overlay
accepts mouse input only until the destination click is delivered.
If you arm walking by mistake, either choose a destination or press `Ctrl+F6`
to tuck/cancel it, then press `Ctrl+F6` again to wake the penguin.

## Tuck away and recovery

**Tuck Away** hides the overlay but leaves the process and tray running. It is
not the same as quitting. Wake it through any of these paths:

1. Press `Ctrl+F6`.
2. Select **Wake Penguin** from the tray.
3. Launch `npm run desktop` or the packaged app again; the single-instance
   handler wakes the existing process.

Codex lifecycle events update the hidden base state but never unhide a pet that
the user deliberately tucked away.

## Animation scheduling

The controller maintains a base state and temporary manual overrides:

- `working` rotates through the looping jackhammer, mop, and pizza actions.
- `needs_input` interrupts work with a repeating attention wave.
- `stopped` plays a brief ready dance, then returns to idle or roaming.
- a shortcut or menu action interrupts the base animation and resumes it after
  the temporary action.

Roaming runs only while idle and stops immediately when Codex becomes active.

## Codex lifecycle hooks

The hook-only plugin source is at
`plugins/club-penguin-pet/`. It intentionally exposes no MCP server and gives
the coding agent no pet-action tools.

The plugin sends a redacted event envelope to a user-only local Unix socket:

| Hook | Pet state |
| --- | --- |
| `UserPromptSubmit` | Working |
| `PostToolUse` | Working/resume after approval |
| `PermissionRequest` | Needs input |
| `Stop` | Stopped/ready |

Prompt text, transcripts, tool inputs, and approval payloads are discarded by
the hook process. If the desktop companion is not running, the hook times out
quickly and exits successfully so it cannot block Codex.

The plugin is source-complete but is not installed automatically. Installing a
local plugin changes user-level Codex configuration and requires reviewing and
trusting its hooks; keep that as an explicit setup step after the desktop smoke
test.

From the repository root, install it through the checked-in local marketplace:

```bash
codex plugin marketplace add "$PWD"
codex plugin add club-penguin-pet@club-penguin-pet-local
```

Restart Codex, open `/hooks` if prompted, review the four command hooks, and
trust them. Codex records trust against the exact hook definitions and asks for
review again if they change. The hooks forward only event, session, and turn
identifiers to the pet's user-only local socket.

## Current limits

- `Stop` does not prove success versus failure, so the ready animation means
  “Codex stopped working,” not “Codex definitely succeeded.”
- The first release targets the primary display. Multi-monitor transfer is a
  later milestone.
- Native Wayland does not guarantee the positioning and topmost behavior this
  design requires, so `desktop/run-x11.sh` explicitly requests Xwayland.
- A tray icon may require a StatusNotifier/AppIndicator extension on GNOME;
  `Ctrl+F6` and relaunch remain recovery paths.
