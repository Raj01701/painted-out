#!/usr/bin/env bash
# Copies cut layer sets into the game: images to public/, manifests to src/art/.
set -euo pipefail
cd "$(dirname "$0")/.."
for dir in art/layers/*/; do
  name=$(basename "$dir")
  mkdir -p "game/public/art/$name" game/src/art
  cp "$dir"*.png "$dir"*.webp "game/public/art/$name/"
  cp "$dir/layers.json" "game/src/art/$name.json"
  echo "synced $name"
done
