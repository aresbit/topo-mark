/** Raw bookmark from Chrome API */
export interface ChromeBookmark {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  dateAdded?: number;
  children?: ChromeBookmark[];
}

/** Flattened bookmark with feature context */
export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  parentId: string;
  folderPath: string[];
  dateAdded: number;
}

/** Numerical feature vector for a bookmark */
export interface BookmarkVector {
  bookmarkId: string;
  features: Float64Array;
}

/** A node in the Mapper graph */
export interface MapperNode {
  id: number;
  size: number;
  bookmarkIds: string[];
  label?: string;
  summary?: ClusterSummary;
}

/** Human-readable explanation for a Mapper node */
export interface ClusterSummary {
  title: string;
  domains: string[];
  folders: string[];
  terms: string[];
}

/** An edge in the Mapper graph */
export interface MapperEdge {
  source: number;
  target: number;
}

/** The complete Mapper graph result */
export interface MapperGraph {
  nodes: MapperNode[];
  edges: MapperEdge[];
}

/** Node-to-component mapping for coloring */
export interface ComponentMap {
  [nodeId: number]: number;
}

/** Full classification output */
export interface ClassifierResult {
  graph: MapperGraph;
  bookmarks: BookmarkItem[];
  vectors: BookmarkVector[];
  nodeLabels: number[];
  components: ComponentMap;
}

/** Algorithm configuration */
export interface MapperConfig {
  nIntervals: number;
  overlapFrac: number;
  clusterThreshold: number;
  minClusterSize: number;
  featureDim: number;
  pcaDim: number;
}
