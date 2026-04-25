/**
 * TopoMark — Background Service Worker
 *
 * Handles bookmarks classification triggered by:
 *  - Extension install/update
 *  - Bookmarks changed (chrome.bookmarks.onChanged)
 *  - Message from popup
 */

import { readAllBookmarks } from "./utils/bookmarks";
import { saveResult, loadResult, loadConfig, saveConfig } from "./utils/storage";
import { runMapper, DEFAULT_CONFIG } from "./algorithm/mapper";
import type { ClassifierResult, MapperConfig } from "./algorithm/types";

let cachedResult: ClassifierResult | null = null;

function toPopupResult(result: ClassifierResult): ClassifierResult {
  return {
    ...result,
    vectors: [],
  };
}

function hasNodeSummaries(result: ClassifierResult | null): result is ClassifierResult {
  return !!result && result.graph.nodes.every((node) => !!node.summary);
}

async function classifyBookmarks(config?: MapperConfig, folderId?: string): Promise<ClassifierResult> {
  const cfg = config ?? (await loadConfig()) ?? DEFAULT_CONFIG;
  const bookmarks = await readAllBookmarks(folderId);
  const result = toPopupResult(runMapper(bookmarks, cfg));
  await saveResult(result).catch((err: Error) => {
    console.warn("TopoMark result cache skipped:", err);
  });
  cachedResult = result;
  return result;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(
  (
    msg: { action: string; config?: MapperConfig; folderId?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    if (msg.action === "classify") {
      classifyBookmarks(msg.config, msg.folderId)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
      return true; // keep channel open for async
    }

    if (msg.action === "getResult") {
      if (hasNodeSummaries(cachedResult)) {
        sendResponse({ ok: true, result: cachedResult });
      } else {
        loadResult()
          .then((r) => {
            cachedResult = hasNodeSummaries(r) ? r : null;
            sendResponse({ ok: true, result: cachedResult });
          })
          .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
      }
      return true;
    }

    if (msg.action === "saveConfig") {
      if (msg.config) saveConfig(msg.config);
      sendResponse({ ok: true });
    }
  }
);

// Auto-classify on install/update
chrome.runtime.onInstalled.addListener(() => {
  classifyBookmarks().catch((err: Error) => {
    console.error("TopoMark classification failed on install:", err);
  });
});

// Re-classify when bookmarks change (debounced)
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function onBookmarkChanged() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    classifyBookmarks().catch((err: Error) => {
      console.error("TopoMark classification failed after bookmark change:", err);
    });
  }, 2000);
}

chrome.bookmarks.onCreated.addListener(onBookmarkChanged);
chrome.bookmarks.onRemoved.addListener(onBookmarkChanged);
chrome.bookmarks.onChanged.addListener(onBookmarkChanged);
chrome.bookmarks.onMoved.addListener(onBookmarkChanged);
