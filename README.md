# TopoMark

TopoMark is a Chrome extension for exploring bookmarks as a topology graph. It reads your Chrome bookmarks locally, extracts lightweight features from titles, URLs, folders, and timestamps, then builds a Mapper-style graph so related bookmark groups can be inspected visually.

## Features

- Analyze all bookmarks or a selected bookmark folder.
- Explore a topology graph with zoom and pan.
- Click a node to drill into a second-level subgraph.
- View bookmark URLs for the selected node and open links directly.
- See a compact cluster summary with common sites, folders, and keywords.
- Runs as a Manifest V3 Chrome extension.

## Install For Development

This project uses Bun by default.

```sh
bun install
bun run build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this repository directory.

The extension manifest points to files under `dist/`, so run `bun run build` before loading or reloading the extension.

## Usage

1. Open the TopoMark extension popup.
2. Choose a bookmark folder from the directory selector, or keep **All bookmarks**.
3. Choose an analysis granularity:
   - **Coarse** merges bookmarks into broader themes.
   - **Standard** is the default.
   - **Detailed** creates smaller topic groups.
   - **More detailed** makes the finest split.
4. Click **Classify**.
5. Use the graph:
   - Scroll to zoom.
   - Drag to pan.
   - Click a node to open a second-level analysis for that cluster.
   - Click a subnode to update the URL list on the right.

## Development

Common commands:

```sh
bun run build
bunx tsc --noEmit
bun run clean
```

The build script bundles the background worker and popup, copies static popup assets, and generates Chrome-compatible PNG icons.

## Project Structure

```text
manifest.json              Chrome extension manifest
scripts/build.sh           Build pipeline
scripts/generate-icons.ts  PNG icon generation
src/background.ts          Extension service worker
src/popup/                 Popup UI
src/components/graph-view.ts
src/algorithm/             Feature extraction, PCA, cover, clustering, Mapper graph
src/utils/                 Bookmark and storage helpers
```

## Notes

TopoMark does not modify, delete, or reorganize bookmarks. It reads bookmark metadata through the Chrome bookmarks API and stores only analysis cache data in local extension storage.

Large bookmark collections can produce dense graphs. Selecting a smaller folder usually gives a more useful result than analyzing every bookmark at once.
