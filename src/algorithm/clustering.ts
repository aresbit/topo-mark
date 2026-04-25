/**
 * Browser-safe greedy clustering.
 *
 * Given a subset of data points (identified by `indices` into the
 * full feature matrix), cluster them based on cosine distance without
 * building an O(n^2) distance matrix.
 */

function cosineDist(a: Float64Array, b: Float64Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
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
  if (n < 3) return new Array(n).fill(0); // tiny groups stay together

  const centroids: Float64Array[] = [];
  const counts: number[] = [];
  const labels = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const vector = featureMatrix[indices[i]!]!;
    let bestCluster = -1;
    let bestDistance = Infinity;

    for (let cluster = 0; cluster < centroids.length; cluster++) {
      const distance = cosineDist(vector, centroids[cluster]!);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCluster = cluster;
      }
    }

    if (bestCluster === -1 || bestDistance > threshold) {
      bestCluster = centroids.length;
      centroids.push(new Float64Array(vector));
      counts.push(1);
    } else {
      const centroid = centroids[bestCluster]!;
      const nextCount = (counts[bestCluster] ?? 0) + 1;
      for (let j = 0; j < centroid.length; j++) {
        centroid[j] = ((centroid[j] ?? 0) * (nextCount - 1) + (vector[j] ?? 0)) / nextCount;
      }
      counts[bestCluster] = nextCount;
    }

    labels[i] = bestCluster;
  }

  return labels;
}
