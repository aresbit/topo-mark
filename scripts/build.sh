#!/bin/bash
# TopoMark build script
set -euo pipefail

ROOT="$(dirname "$0")/.."
cd "$ROOT"

echo "=== TopoMark Build ==="

# Clean
rm -rf dist
mkdir -p dist/popup dist/icons

# Build background service worker
echo ">> Building background worker..."
bun build src/background.ts --outdir=dist --target=browser

# Build popup bundle
echo ">> Building popup..."
bun build src/popup/popup.ts --outdir=dist/popup --target=browser

# Copy static assets
echo ">> Copying static assets..."
cp src/popup/popup.html dist/popup/
cp src/popup/popup.css dist/popup/

# Generate Chrome-compatible PNG icons.
bun scripts/generate-icons.ts

echo "=== Build complete ==="
echo "dist/ layout:"
find dist -type f | sort
