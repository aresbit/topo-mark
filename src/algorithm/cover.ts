/**
 * CubicalCover — splits a 1D lens space into overlapping intervals.
 *
 * Mirrors the Python tda-mapper CubicalCover logic:
 * - Divide [min, max] into `nIntervals` intervals
 * - Each interval overlaps with neighbors by `overlapFrac`
 */

export interface CoverInterval {
  lo: number;
  hi: number;
  indices: number[];
}

export class CubicalCover {
  private readonly nIntervals: number;
  private readonly overlapFrac: number;

  constructor(nIntervals: number = 5, overlapFrac: number = 0.3) {
    this.nIntervals = Math.max(1, nIntervals);
    this.overlapFrac = Math.max(0, Math.min(0.5, overlapFrac));
  }

  /**
   * Given 1D lens values, assign each point to interval(s).
   * Returns an array of intervals, each containing the indices of points
   * whose lens values fall within that interval.
   */
  apply(lens: Float64Array): CoverInterval[] {
    const n = lens.length;
    if (n === 0) return [];

    const min = lens[0]!;
    const max = lens[n - 1]!;
    const range = max - min || 1;
    const intervalSize = range / this.nIntervals;
    const overlap = intervalSize * this.overlapFrac;

    // Build intervals
    const intervals: CoverInterval[] = [];
    for (let i = 0; i < this.nIntervals; i++) {
      const center = min + (i + 0.5) * intervalSize;
      const halfSize = intervalSize / 2 + overlap;
      intervals.push({
        lo: center - halfSize,
        hi: center + halfSize,
        indices: [],
      });
    }

    // Assign points to intervals
    for (let j = 0; j < n; j++) {
      const val = lens[j]!;
      for (const interval of intervals) {
        if (val >= interval.lo && val <= interval.hi) {
          interval.indices.push(j);
        }
      }
    }

    // Filter out empty intervals
    return intervals.filter((iv) => iv.indices.length > 0);
  }
}
