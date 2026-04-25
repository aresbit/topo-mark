/**
 * Simple agglomerative (single-linkage) clustering.
 *
 * Given a subset of data points (identified by `indices` into the
 * full feature matrix), cluster them based on cosine distance.
 */

function cosineDist(a: Float64Array, b: Float64Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom < 1e-12 ? 1 : 1 - dot / denom;
}

/**
 * Run single-linkage clustering on a subset of points.
 *
 * @param featureMatrix - Full feature matrix (one row per bookmark)
 * @param indices - Indices of points in this subset
 * @param threshold - Distance threshold for merging clusters
 * @returns Array of cluster IDs (same length as `indices`)
 */
export function clusterSubset(
  featureMatrix: Float64Array[],
  indices: number[],
  threshold: number
): number[] {
  const n = indices.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  if (n < 3) return [0]; // tiny groups stay together

  // Build distance matrix for the subset
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = cosineDist(featureMatrix[indices[i]!]!, featureMatrix[indices[j]!]!);
      dist[i]![j] = d;
      dist[j]![i] = d;
    }
  }

  // Union-Find for agglomerative clustering
  const parent = new Array(n).fill(0).map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  }
  function union(a: number, b: number): void {
    parent[find(a)] = find(b);
  }

  // Single-linkage: merge closest pair below threshold
  // Sort all pairs by distance
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push([dist[i]![j]!, i, j]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);

  for (const [d, i, j] of pairs) {
    if (d > threshold) break;
    union(i, j);
  }

  // Assign final cluster labels (compacted)
  const labelMap = new Map<number, number>();
  const labels = new Array<number>(n);
  let nextLabel = 0;
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!labelMap.has(root)) labelMap.set(root, nextLabel++);
    labels[i] = labelMap.get(root)!;
  }

  return labels;
}
