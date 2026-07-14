# Runtime artwork

Club Penguin artwork and SWF files are not stored in this repository.

Run `npm run setup:assets` from the repository root to download the 22 files
used by the renderer from the community-maintained
[Ice Rink archive](https://icerink.solero.me/media1.clubpenguin.com/play/v2/content/global/penguin/actions/).
The setup script verifies every file against a pinned SHA-256 digest before it
is written here.

The downloader retrieves only the base penguin, the ten action movies, and the
eleven clothing sprites named in `scripts/render-source-manifest.mjs`. Those
files remain subject to their owners' rights; downloading them is separate
from the source code in this repository.
