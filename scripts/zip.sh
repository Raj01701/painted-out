#!/usr/bin/env bash
# Builds the game and zips the contents of dist/ for an itch.io HTML5 upload.
set -euo pipefail
cd "$(dirname "$0")/../game"
npm run build
count=$(find dist -type f | wc -l | tr -d ' ')
if [ "$count" -gt 1000 ]; then echo "itch allows at most 1000 files; build has $count" >&2; exit 1; fi
mkdir -p ../build
version=$(git describe --always --dirty)
rm -f "../build/painted-out-$version.zip"
(cd dist && zip -qr "../../build/painted-out-$version.zip" . -x '*.map')
echo "build/painted-out-$version.zip ($count files)"
