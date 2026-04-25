/**
 * Mapper graph construction — the core TDA algorithm.
 *
 * Steps:
 *  1. Extract feature vectors from bookmarks
 *  2. Compute PCA lens (1D)
 *  3. Apply cubical cover to the lens space
 *  4. Cluster within each cover interval (in original feature space)
 *  5. Build graph: nodes = clusters, edges = overlaps
 */

import type {
  BookmarkItem,
  BookmarkVector,
  ClassifierResult,
  MapperConfig,
  MapperGraph,
  MapperNode,
  MapperEdge,
  ComponentMap,
  ClusterSummary,
} from "./types";

import { extractFeatures } from "./feature";
import { pca } from "./pca";
import { CubicalCover } from "./cover";
import { clusterSubset } from "./clustering";

export const DEFAULT_CONFIG: MapperConfig = {
  nIntervals: 5,
  overlapFrac: 0.3,
  clusterThreshold: 0.6,
  minClusterSize: 2,
  featureDim: 100,
  pcaDim: 1,
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "you", "your", "are",
  "how", "what", "why", "can", "will", "not", "have", "has", "into", "about",
  "http", "https", "www", "com", "org", "net", "html", "page", "index",
  "bookmark", "bookmarks",
]);

/**
 * Run the full Mapper classification pipeline.
 */
export function runMapper(
  bookmarks: BookmarkItem[],
  config: MapperConfig = DEFAULT_CONFIG
): ClassifierResult {
  // 1. Extract features
  const { vectors } = extractFeatures(bookmarks);
  if (vectors.length === 0) {
    return {
      graph: { nodes: [], edges: [] },
      bookmarks: [],
      vectors: [],
      nodeLabels: [],
      components: {},
    };
  }

  const featureMatrix = vectors.map((v) => v.features);

  // 2. PCA lens (1D)
  const lensData = pca(featureMatrix, config.pcaDim);
  const lens = new Float64Array(lensData.map((v) => v[0]!));

  // 3. Cubical cover
  const cover = new CubicalCover(config.nIntervals, config.overlapFrac);
  const intervals = cover.apply(lens);

  // 4. Cluster per interval
  const clusterAssignments: Map<number, number[]>[] = intervals.map(() => new Map());
  // clusterAssignments[i]: clusterLabel -> bookmarkIndex for interval i

  for (let ivIdx = 0; ivIdx < intervals.length; ivIdx++) {
    const interval = intervals[ivIdx]!;
    if (interval.indices.length < config.minClusterSize) {
      // Too small — put all in one cluster
      for (const idx of interval.indices) {
        const list = clusterAssignments[ivIdx]!.get(0) ?? [];
        list.push(idx);
        clusterAssignments[ivIdx]!.set(0, list);
      }
      continue;
    }

    const labels = clusterSubset(
      featureMatrix,
      interval.indices,
      config.clusterThreshold
    );

    for (let i = 0; i < interval.indices.length; i++) {
      const idx = interval.indices[i]!;
      const label = labels[i]!;
      const list = clusterAssignments[ivIdx]!.get(label) ?? [];
      list.push(idx);
      clusterAssignments[ivIdx]!.set(label, list);
    }
  }

  // 5. Build Mapper graph
  // Each (intervalIdx, clusterLabel) pair becomes a unique node
  const nodeMap = new Map<string, MapperNode>();
  const bookmarkToNodes = new Map<number, Set<string>>();

  // Global node counter
  let nextNodeId = 0;

  for (let ivIdx = 0; ivIdx < clusterAssignments.length; ivIdx++) {
    for (const [clusterLabel, indices] of clusterAssignments[ivIdx]!) {
      const nodeKey = `${ivIdx}-${clusterLabel}`;
      const node: MapperNode = {
        id: nextNodeId++,
        size: indices.length,
        bookmarkIds: indices.map((i) => vectors[i]!.bookmarkId),
      };
      nodeMap.set(nodeKey, node);

      for (const idx of indices) {
        const set = bookmarkToNodes.get(idx) ?? new Set();
        set.add(nodeKey);
        bookmarkToNodes.set(idx, set);
      }
    }
  }

  // Build edges: if two nodes share a bookmark, connect them
  const edgeSet = new Set<string>();
  const edges: MapperEdge[] = [];
  const nodeList = [...nodeMap.values()];

  for (const [, nodeKeys] of bookmarkToNodes) {
    const keys = [...nodeKeys];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = nodeMap.get(keys[i]!)!;
        const b = nodeMap.get(keys[j]!)!;
        // Ensure canonical ordering for dedup
        const edgeKey =
          a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({ source: a.id, target: b.id });
        }
      }
    }
  }

  // Compute connected components (for coloring)
  const components = findComponents(nodeList, edges);

  const bookmarkById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  for (const node of nodeList) {
    const nodeBookmarks = node.bookmarkIds
      .map((id) => bookmarkById.get(id))
      .filter((bookmark) => bookmark !== undefined);
    node.summary = summarizeCluster(nodeBookmarks);
    node.label = node.summary.title;
  }

  // Build nodeLabels: for each bookmark, which nodes it belongs to
  const nodeLabels: number[] = [];
  const lookup = new Map<string, MapperNode>();
  for (const [key, node] of nodeMap) {
    lookup.set(key, node);
  }
  for (let i = 0; i < vectors.length; i++) {
    const idx = i;
    const keys = bookmarkToNodes.get(idx);
    if (keys && keys.size > 0) {
      // Assign the first node id as the primary label
      const firstKey = keys.values().next().value;
      const firstNode = firstKey ? lookup.get(firstKey) : undefined;
      nodeLabels.push(firstNode?.id ?? -1);
    } else {
      nodeLabels.push(-1);
    }
  }

  return {
    graph: { nodes: nodeList, edges },
    bookmarks,
    vectors,
    nodeLabels,
    components,
  };
}

function summarizeCluster(bookmarks: BookmarkItem[]): ClusterSummary {
  const domains = topValues(bookmarks, (bookmark) => {
    try {
      return new URL(bookmark.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }, 3);

  const folders = topValues(bookmarks, (bookmark) => {
    const path = bookmark.folderPath.filter(Boolean);
    return path[path.length - 1] ?? "";
  }, 3);

  const terms = topTerms(bookmarks, 6);
  const title = terms[0] ?? folders[0] ?? domains[0] ?? "未命名主题";

  return { title, domains, folders, terms };
}

function topValues(
  bookmarks: BookmarkItem[],
  getValue: (bookmark: BookmarkItem) => string,
  limit: number
): string[] {
  const counts = new Map<string, number>();
  for (const bookmark of bookmarks) {
    const value = getValue(bookmark).trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function topTerms(bookmarks: BookmarkItem[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const bookmark of bookmarks) {
    const tokens = `${bookmark.title} ${bookmark.folderPath.join(" ")}`
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1 && !/^\d+$/.test(token) && !STOP_WORDS.has(token));

    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

function findComponents(
  nodes: MapperNode[],
  edges: MapperEdge[]
): ComponentMap {
  const parent = new Map<number, number>();
  for (const n of nodes) parent.set(n.id, n.id);

  function find(x: number): number {
    let p = parent.get(x)!;
    while (p !== parent.get(p)) {
      parent.set(p, parent.get(parent.get(p)!)!);
      p = parent.get(p)!;
    }
    return p;
  }

  function union(a: number, b: number): void {
    parent.set(find(a), find(b));
  }

  for (const e of edges) {
    union(e.source, e.target);
  }

  const compMap: ComponentMap = {};
  const compIds = new Map<number, number>();
  let nextComp = 0;
  for (const n of nodes) {
    const root = find(n.id);
    if (!compIds.has(root)) compIds.set(root, nextComp++);
    compMap[n.id] = compIds.get(root)!;
  }
  return compMap;
}
