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

async function classifyBookmarks(config?: MapperConfig): Promise<ClassifierResult> {
  const cfg = config ?? (await loadConfig()) ?? DEFAULT_CONFIG;
  const bookmarks = await readAllBookmarks();
  const result = runMapper(bookmarks, cfg);
  await saveResult(result);
  cachedResult = result;
  return result;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(
  (
    msg: { action: string; config?: MapperConfig },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    if (msg.action === "classify") {
      classifyBookmarks(msg.config)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
      return true; // keep channel open for async
    }

    if (msg.action === "getResult") {
      if (cachedResult) {
        sendResponse({ ok: true, result: cachedResult });
      } else {
        loadResult()
          .then((r) => {
            cachedResult = r;
            sendResponse({ ok: true, result: r });
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
  classifyBookmarks();
});

// Re-classify when bookmarks change (debounced)
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function onBookmarkChanged() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => classifyBookmarks(), 2000);
}

chrome.bookmarks.onCreated.addListener(onBookmarkChanged);
chrome.bookmarks.onRemoved.addListener(onBookmarkChanged);
chrome.bookmarks.onChanged.addListener(onBookmarkChanged);
chrome.bookmarks.onMoved.addListener(onBookmarkChanged);
