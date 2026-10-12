#!/usr/bin/env bash
# Fails the build if Phaser 3-only APIs slip into the source.
cd "$(dirname "$0")/../game" || exit 1
if grep -rnE "setPipeline\(|postFX|preFX|tintFill|Geom\.Point|BitmapMask|Light2D|GameObjects\.(Mesh|Plane)\b" src; then
  echo "Phaser 3 API found; use the Phaser 4 equivalent." >&2
  exit 1
fi
