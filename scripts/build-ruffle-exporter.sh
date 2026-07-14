#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="$ROOT/.cache/ruffle-exporter"
COMMIT="4d3637f0ab2b0276e00f93a160de545db0f25c66"
PATCH="$ROOT/scripts/ruffle-exporter-transparent.patch"
PATCH_HASH="$(sha256sum "$PATCH" | cut -d' ' -f1)"
MARKER="$COMMIT:$PATCH_HASH"

if [[ -x "$CACHE_DIR/ruffle-exporter" ]] \
  && [[ -f "$CACHE_DIR/source-version" ]] \
  && [[ "$(<"$CACHE_DIR/source-version")" == "$MARKER" ]]; then
  exit 0
fi

for command in cargo git java sha256sum; do
  if ! command -v "$command" >/dev/null; then
    echo "Missing build prerequisite: $command" >&2
    exit 1
  fi
done

SOURCE_DIR="$CACHE_DIR/source-$COMMIT-$PATCH_HASH"
mkdir -p "$CACHE_DIR"
if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  git clone --filter=blob:none --no-checkout https://github.com/ruffle-rs/ruffle.git "$SOURCE_DIR"
  git -C "$SOURCE_DIR" checkout --detach "$COMMIT"
fi

if git -C "$SOURCE_DIR" apply --check "$PATCH"; then
  git -C "$SOURCE_DIR" apply "$PATCH"
elif ! git -C "$SOURCE_DIR" apply --reverse --check "$PATCH"; then
  echo "Ruffle transparency patch does not apply cleanly" >&2
  exit 1
fi

env CARGO_HOME="$CACHE_DIR/cargo" cargo build \
  --manifest-path "$SOURCE_DIR/Cargo.toml" \
  --release \
  --package exporter
cp "$SOURCE_DIR/target/release/exporter" "$CACHE_DIR/ruffle-exporter"
printf '%s\n' "$MARKER" > "$CACHE_DIR/source-version"
