import type { ChromeBookmark, BookmarkItem } from "../algorithm/types";

/**
 * Flatten the Chrome bookmark tree into a flat list.
 * Folders without URLs are treated as organizational nodes.
 */
export function flattenBookmarks(
  nodes: ChromeBookmark[],
  parentPath: string[] = []
): BookmarkItem[] {
  const result: BookmarkItem[] = [];
  for (const node of nodes) {
    const currentPath = node.title
      ? [...parentPath, node.title]
      : parentPath;

    if (node.url) {
      result.push({
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId ?? "",
        folderPath: currentPath,
        dateAdded: node.dateAdded ?? 0,
      });
    }

    if (node.children && node.children.length > 0) {
      result.push(...flattenBookmarks(node.children, currentPath));
    }
  }
  return result;
}

/**
 * Read all bookmarks from Chrome API and flatten them.
 * Falls back to a default folder if the root returns an unexpected structure.
 */
export async function readAllBookmarks(folderId?: string): Promise<BookmarkItem[]> {
  if (folderId) {
    const nodes = await chrome.bookmarks.getSubTree(folderId);
    const root = nodes[0];
    if (!root) return [];
    return flattenBookmarks([root]);
  }

  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  if (!root || !root.children) return [];
  return flattenBookmarks(root.children);
}
