import type { BookmarkItem, BookmarkVector } from "./types";

const MAX_VOCAB_SIZE = 200;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildVocabulary(items: BookmarkItem[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const item of items) {
    for (const token of tokenize(item.title)) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
    // Extract domain from URL
    try {
      const domain = new URL(item.url).hostname;
      for (const token of tokenize(domain)) {
        freq.set(token, (freq.get(token) ?? 0) + 1);
      }
    } catch {
      // skip invalid URLs
    }
  }

  // Sort by frequency descending, take top MAX_VOCAB_SIZE
  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_VOCAB_SIZE);

  const vocab = new Map<string, number>();
  for (const [word] of sorted) {
    vocab.set(word, vocab.size);
  }
  return vocab;
}

/**
 * Compute a TF-IDF-like vector for each bookmark.
 *
 * Feature dimensions:
 *   0..V-1   : term frequency of title+domain tokens
 *   V        : folder depth (normalized)
 *   V+1      : bookmark age (normalized years)
 */
export function extractFeatures(
  items: BookmarkItem[],
  vocab: Map<string, number> | null = null
): { vectors: BookmarkVector[]; vocab: Map<string, number> } {
  if (items.length === 0) {
    return { vectors: [], vocab: new Map() };
  }

  const useVocab = vocab ?? buildVocabulary(items);
  const V = useVocab.size; // vocabulary size
  const dim = V + 2; // + folder depth + age

  // Precompute age normalization
  const minTime = Math.min(...items.map((b) => b.dateAdded));
  const maxTime = Math.max(...items.map((b) => b.dateAdded));
  const timeRange = maxTime - minTime || 1;

  // Precompute max folder depth
  const maxDepth = Math.max(...items.map((b) => b.folderPath.length)) || 1;

  const vectors: BookmarkVector[] = [];

  for (const item of items) {
    const vec = new Float64Array(dim);

    // Title tokens
    for (const token of tokenize(item.title)) {
      const idx = useVocab.get(token);
      if (idx !== undefined) vec[idx] = (vec[idx] ?? 0) + 1;
    }

    // Domain tokens
    try {
      const domain = new URL(item.url).hostname;
      for (const token of tokenize(domain)) {
        const idx = useVocab.get(token);
        if (idx !== undefined) vec[idx] = (vec[idx] ?? 0) + 1;
      }
    } catch {
      // skip
    }

    // Folder depth
    vec[V] = item.folderPath.length / maxDepth;

    // Normalized age (0 = newest, 1 = oldest)
    vec[V + 1] = (item.dateAdded - minTime) / timeRange;

    vectors.push({ bookmarkId: item.id, features: vec });
  }

  return { vectors, vocab: useVocab };
}

/**
 * Default config: build vocabulary from a sample of bookmarks.
 */
export function buildDefaultVocab(items: BookmarkItem[]): Map<string, number> {
  return buildVocabulary(items);
}
