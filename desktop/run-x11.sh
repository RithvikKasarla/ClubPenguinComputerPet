#!/usr/bin/env bash
set -euo pipefail

desktop_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$desktop_dir/.." && pwd)"

if [[ -z "${DISPLAY:-}" ]]; then
  echo "No X11 DISPLAY is available. Start an X11/Xwayland session before launching the roaming overlay." >&2
  exit 1
fi

if [[ -n "${ELECTRON_BIN:-}" ]]; then
  electron_bin="$ELECTRON_BIN"
elif [[ -x "$project_dir/node_modules/electron/dist/electron" ]]; then
  electron_bin="$project_dir/node_modules/electron/dist/electron"
elif [[ -x "$project_dir/node_modules/.bin/electron" ]]; then
  electron_bin="$project_dir/node_modules/.bin/electron"
elif command -v electron >/dev/null 2>&1; then
  electron_bin="$(command -v electron)"
else
  echo "Electron was not found. Install it locally with: npm install --save-dev electron" >&2
  exit 1
fi

exec "$electron_bin" --ozone-platform=x11 "$desktop_dir/main.mjs" "$@"
