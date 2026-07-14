# Club Penguin Computer Pet

A transparent desktop penguin that walks around the primary display, plays the
full synchronized action renderer, throws snowballs, and reflects coarse Codex
lifecycle events through a local hook-only plugin.

The coding agent is not given control of the pet. Walking, roaming, snowballs,
and named animations remain user-controlled through the penguin menu and
desktop shortcuts. Codex hooks only switch the pet between working,
needs-input, and stopped states.

## Set up

Requirements: Node.js with npm, Git, Rust/Cargo, Java, and an X11 or Xwayland
Linux session. The first build compiles the pinned Ruffle frame exporter and
can take several minutes.

```bash
npm install
npm run build
npm run desktop
```

`npm run build` first downloads the 22 SWFs used by the renderer from the
community-maintained [Ice Rink archive](https://icerink.solero.me/media1.clubpenguin.com/play/v2/content/global/penguin/actions/),
verifies pinned SHA-256 hashes, and stores them under the ignored `assets/`
tree. It then creates the ignored synchronized PNG frame catalog. No Club
Penguin artwork or generated frames are committed to this repository.

On GNOME Wayland, install the desktop-owned shortcuts once so they work while
Codex is focused:

```bash
npm run desktop:shortcuts:install
```

See [desktop/README.md](desktop/README.md) for controls, tuck/wake recovery,
and Codex hook installation.

## Where the renderer comes from

[Project Flipper's ClubPenguin repository](https://github.com/project-flipper/ClubPenguin)
is the reference for animation sequencing, shared origins, and clothing depth.
It does **not** contain the SWF or atlas artwork needed by this project. The
media is downloaded separately from Ice Rink; exact paths and hashes live in
`scripts/fetch-club-penguin-assets.mjs`.

The build pins Ruffle for deterministic frame capture. Further provenance and
the alignment decisions are recorded in
[docs/RENDERER_PROVENANCE.md](docs/RENDERER_PROVENANCE.md) and
[docs/CLUB_PENGUIN_RENDER_ALIGNMENT_RESEARCH.md](docs/CLUB_PENGUIN_RENDER_ALIGNMENT_RESEARCH.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run setup:assets` | Download and verify the required SWFs |
| `npm run build` | Fetch assets and build the synchronized frame catalog |
| `npm run desktop` | Launch the X11/Xwayland desktop companion |
| `npm test` | Run the automated test suite |

## Fan-project notice

This is an unofficial fan project and is not affiliated with or endorsed by
Disney or Club Penguin. Club Penguin names, characters, and artwork belong to
their respective owners. Original artwork and media are not included in this
source repository.
