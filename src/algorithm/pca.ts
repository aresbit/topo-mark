/**
 * Simplified PCA using Power Iteration.
 *
 * Finds the first `k` principal components via the NIPALS-like approach.
 * For the Mapper lens, k=1 is typically sufficient.
 */

function meanCenter(matrix: Float64Array[], k: number): Float64Array {
  const mean = new Float64Array(k);
  for (const row of matrix) {
    for (let j = 0; j < k; j++) mean[j] += row[j];
  }
  for (let j = 0; j < k; j++) mean[j] /= matrix.length;
  for (const row of matrix) {
    for (let j = 0; j < k; j++) row[j] -= mean[j];
  }
  return mean;
}

function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function normalize(v: Float64Array): void {
  const len = Math.sqrt(dot(v, v));
  if (len > 1e-12) for (let i = 0; i < v.length; i++) v[i] /= len;
}

function powerIteration(
  matrix: Float64Array[],
  dim: number,
  iterations: number = 100
): Float64Array {
  // Random initial vector
  const v = new Float64Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.random() * 2 - 1;
  normalize(v);

  for (let iter = 0; iter < iterations; iter++) {
    const vNext = new Float64Array(dim);
    // Compute X * (X^T * v) = X * projection
    // First compute t = X^T * v
    const t = new Float64Array(matrix.length);
    for (let i = 0; i < matrix.length; i++) {
      t[i] = dot(matrix[i], v);
    }
    // Then compute vNext = X * t
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < dim; j++) {
        vNext[j] += t[i] * matrix[i][j];
      }
    }
    normalize(vNext);
    // Check convergence
    let diff = 0;
    for (let j = 0; j < dim; j++) diff += Math.abs(vNext[j] - v[j]);
    v.set(vNext);
    if (diff < 1e-8) break;
  }

  return v;
}

/**
 * Run PCA to reduce feature vectors to `k` dimensions.
 * Returns the projected data (each row is a k-D point).
 *
 * For Mapper lens, call with k=1 to get a 1D lens function.
 */
export function pca(
  vectors: Float64Array[],
  k: number = 1
): Float64Array[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0]!.length;

  // Deep copy so we don't mutate originals
  const matrix = vectors.map((v) => new Float64Array(v));
  meanCenter(matrix, dim);

  const result: Float64Array[] = vectors.map(() => new Float64Array(k));

  // Deflation-based PCA: find PCs one by one
  const working = matrix.map((v) => new Float64Array(v));
  for (let pc = 0; pc < k; pc++) {
    const pcDir = powerIteration(working, dim);
    for (let i = 0; i < vectors.length; i++) {
      result[i]![pc] = dot(working[i], pcDir);
    }
    // Deflate: subtract projection onto this PC
    for (const row of working) {
      const proj = dot(row, pcDir);
      for (let j = 0; j < dim; j++) {
        row[j] -= proj * pcDir[j];
      }
    }
  }

  return result;
}
