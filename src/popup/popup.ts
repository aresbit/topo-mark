/**
 * TopoMark — Popup Script
 *
 * Coordinates the classification workflow and renders
 * the Mapper graph visualization.
 */

import type { ClassifierResult, MapperNode, MapperConfig } from "../algorithm/types";
import { GraphView } from "../components/graph-view";
import { runMapper } from "../algorithm/mapper";

// ---- DOM refs ----
const btnBack = document.getElementById("btnBack") as HTMLButtonElement;
const btnClassify = document.getElementById("btnClassify") as HTMLButtonElement;
const folderPicker = document.getElementById("folderPicker") as HTMLDivElement;
const folderButton = document.getElementById("folderButton") as HTMLButtonElement;
const folderLabel = document.getElementById("folderLabel") as HTMLSpanElement;
const folderMenu = document.getElementById("folderMenu") as HTMLDivElement;
const selectIntervals = document.getElementById("selectIntervals") as HTMLSelectElement;
const viewTitle = document.getElementById("viewTitle") as HTMLSpanElement;
const loading = document.getElementById("loading") as HTMLDivElement;
const mainContent = document.getElementById("mainContent") as HTMLDivElement;
const emptyState = document.getElementById("emptyState") as HTMLDivElement;
const bookmarkCount = document.getElementById("bookmarkCount") as HTMLSpanElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const sidebar = document.getElementById("sidebar") as HTMLDivElement;
const sidebarTitle = document.getElementById("sidebarTitle") as HTMLHeadingElement;
const sidebarBookmarks = document.getElementById("sidebarBookmarks") as HTMLDivElement;
const canvas = document.getElementById("graphCanvas") as HTMLCanvasElement;

let currentResult: ClassifierResult | null = null;
let rootResult: ClassifierResult | null = null;
let currentBookmarks: ClassifierResult["bookmarks"] = [];
let currentConfig: MapperConfig | null = null;
let isDrilldown = false;
let graphView: GraphView | null = null;
let selectedFolderId = "";
let selectedFolderTitle = "全部书签";

function setLoading(on: boolean): void {
  loading.classList.toggle("hidden", !on);
  if (on) mainContent.classList.add("hidden");
}

function setStatus(msg: string): void {
  statusText.textContent = msg;
}

function updateUI(result: ClassifierResult): void {
  currentConfig ??= readConfigFromControls();
  rootResult = result;
  isDrilldown = false;
  btnBack.classList.add("hidden");
  mainContent.classList.remove("drilldown");
  folderPicker.classList.remove("hidden");
  viewTitle.classList.add("hidden");
  viewTitle.textContent = selectedFolderName();
  sidebar.classList.add("hidden");
  currentResult = result;
  currentBookmarks = result.bookmarks;

  if (result.bookmarks.length === 0) {
    emptyState.classList.remove("hidden");
    mainContent.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  mainContent.classList.remove("hidden");
  bookmarkCount.textContent = `${result.bookmarks.length} 书签`;

  // Render graph
  renderGraph(result);
}

function renderGraph(result: ClassifierResult, bookmarks: ClassifierResult["bookmarks"] = result.bookmarks): void {
  currentResult = result;
  currentBookmarks = bookmarks;
  // Resize canvas
  const container = canvas.parentElement!;
  const w = container.clientWidth;
  const h = container.clientHeight || 400;
  canvas.width = w;
  canvas.height = h;

  if (graphView) graphView.destroy();
  graphView = new GraphView(canvas);

  graphView.setOnNodeClick((node: MapperNode) => {
    if (isDrilldown) {
      showNodeDetail(node, result, bookmarks);
    } else {
      drillIntoNode(node, result);
    }
  });

  graphView.renderAnimated(result.graph, result.components, w, h);

  canvas.onwheel = (e) => graphView?.handleWheel(e);
  canvas.onpointerdown = (e) => graphView?.handlePointerDown(e);
  canvas.onpointermove = (e) => graphView?.handlePointerMove(e);
  canvas.onpointerup = (e) => graphView?.handlePointerUp(e);
  canvas.onpointercancel = (e) => graphView?.handlePointerUp(e);
}

function resizeGraphToContainer(): void {
  if (!graphView || !currentResult) return;
  const container = canvas.parentElement;
  if (!container) return;
  graphView.resize(
    container.clientWidth,
    container.clientHeight || 400,
    currentResult.graph,
    currentResult.components
  );
}

function drillIntoNode(node: MapperNode, result: ClassifierResult): void {
  const fullNode = result.graph.nodes.find((n) => n.id === node.id);
  const baseConfig = currentConfig ?? readConfigFromControls();
  if (!fullNode) return;

  const bookmarkById = new Map(result.bookmarks.map((bm) => [bm.id, bm]));
  const nodeBookmarks = fullNode.bookmarkIds
    .map((bmId) => bookmarkById.get(bmId))
    .filter((bm) => bm !== undefined);
  if (nodeBookmarks.length === 0) return;

  const subConfig: MapperConfig = {
    ...baseConfig,
    nIntervals: Math.min(8, Math.max(3, Math.ceil(Math.sqrt(nodeBookmarks.length / 8)))),
    minClusterSize: 1,
  };
  const subResult = buildDrilldownResult(nodeBookmarks, subConfig);
  isDrilldown = true;
  btnBack.classList.remove("hidden");
  folderPicker.classList.add("hidden");
  viewTitle.classList.remove("hidden");
  mainContent.classList.add("drilldown");
  viewTitle.textContent = `节点 #${fullNode.id} / ${fullNode.summary?.title ?? fullNode.label ?? "二次分析"}`;
  sidebar.classList.remove("hidden");
  showParentClusterDetail(fullNode, nodeBookmarks);
  requestAnimationFrame(() => renderGraph(subResult, nodeBookmarks));
  setStatus(`二次分析 — ${subResult.graph.nodes.length} 子节点`);
}

function showParentClusterDetail(node: MapperNode, bookmarks: ClassifierResult["bookmarks"]): void {
  sidebarTitle.textContent = `节点 #${node.id} (${bookmarks.length} 书签)`;
  renderSidebar(node, bookmarks);
}

function showNodeDetail(
  node: MapperNode,
  result: ClassifierResult,
  bookmarks: ClassifierResult["bookmarks"]
): void {
  const wasHidden = sidebar.classList.contains("hidden");
  sidebar.classList.remove("hidden");

  // Find the full node data
  const fullNode = result.graph.nodes.find((n) => n.id === node.id);
  if (!fullNode) {
    sidebarTitle.textContent = `节点 #${node.id}`;
    sidebarBookmarks.innerHTML = "";
    return;
  }

  sidebarTitle.textContent = `节点 #${node.id} (${fullNode.size} 书签)`;

  const bookmarkById = new Map(bookmarks.map((bm) => [bm.id, bm]));
  const nodeBookmarks = fullNode.bookmarkIds
    .map((bmId) => bookmarkById.get(bmId))
    .filter((bm) => bm !== undefined);

  renderSidebar(fullNode, nodeBookmarks);

  if (wasHidden) requestAnimationFrame(resizeGraphToContainer);
}

function renderSidebar(node: MapperNode, bookmarks: ClassifierResult["bookmarks"]): void {
  sidebarBookmarks.innerHTML = "";

  const listTitle = document.createElement("div");
  listTitle.className = "bookmark-list-title";
  listTitle.textContent = `书签 URL (${bookmarks.length})`;
  sidebarBookmarks.appendChild(listTitle);

  for (const bm of bookmarks.slice(0, 120)) {
    const link = document.createElement("a");
    link.className = "sidebar-item bookmark-link";
    link.href = bm.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.innerHTML = `
      <div class="title">${escapeHtml(bm.title || "无标题")}</div>
      <div class="url">${escapeHtml(bm.url)}</div>
    `;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.tabs.create({ url: bm.url });
    });
    sidebarBookmarks.appendChild(link);
  }

  if (bookmarks.length > 120) {
    const more = document.createElement("div");
    more.className = "sidebar-item";
    more.innerHTML = `<div class="url">...还有 ${bookmarks.length - 120} 个书签</div>`;
    sidebarBookmarks.appendChild(more);
  }

  sidebarBookmarks.appendChild(renderClusterSummary(node));
}

function renderClusterSummary(node: MapperNode): HTMLElement {
  const summary = document.createElement("section");
  summary.className = "cluster-summary";
  const cluster = node.summary;
  const title = cluster?.title ?? node.label ?? "未命名主题";

  summary.innerHTML = `
    <div class="summary-title">聚类中心：${escapeHtml(title)}</div>
    <div class="summary-desc">这个节点代表一组在标题、域名、文件夹路径上相近的书签。</div>
    ${summaryRow("常见站点", cluster?.domains ?? [])}
    ${summaryRow("常见文件夹", cluster?.folders ?? [])}
    ${summaryRow("关键词", cluster?.terms ?? [])}
  `;

  return summary;
}

function summaryRow(label: string, values: string[]): string {
  const content = values.length > 0
    ? values.map(escapeHtml).join("、")
    : "暂无明显特征";
  return `<div class="summary-row"><span>${label}</span><b>${content}</b></div>`;
}

// ---- Message passing ----

async function classify(): Promise<void> {
  setLoading(true);
  setStatus("正在分析书签拓扑结构...");
  btnClassify.disabled = true;

  try {
    const config = readConfigFromControls();
    currentConfig = config;

    const response = await chrome.runtime.sendMessage<
      { action: string; config?: MapperConfig; folderId?: string },
      { ok: boolean; result?: ClassifierResult; error?: string }
    >({ action: "classify", config, folderId: selectedFolderId || undefined });

    if (response.ok && response.result) {
      updateUI(response.result);
      setStatus(`完成 — ${response.result.graph.nodes.length} 节点, ${response.result.graph.edges.length} 边`);
    } else {
      setStatus("错误: " + (response.error ?? "未知错误"));
    }
  } catch (err) {
    setStatus("错误: " + (err instanceof Error ? err.message : String(err)));
  } finally {
    setLoading(false);
    btnClassify.disabled = false;
  }
}

function readConfigFromControls(): MapperConfig {
  return {
    nIntervals: parseInt(selectIntervals.value, 10),
    overlapFrac: 0.3,
    clusterThreshold: 0.6,
    minClusterSize: 2,
    featureDim: 100,
    pcaDim: 1,
  };
}

function buildDrilldownResult(
  bookmarks: ClassifierResult["bookmarks"],
  config: MapperConfig
): ClassifierResult {
  const mapperResult = runMapper(bookmarks, config);
  if (mapperResult.graph.nodes.length > 1 || bookmarks.length <= 1) {
    return mapperResult;
  }

  const domainGroups = groupBookmarks(bookmarks, (bookmark) => {
    try {
      return new URL(bookmark.url).hostname.replace(/^www\./, "");
    } catch {
      return "其他";
    }
  });
  const groups = domainGroups.length > 1
    ? domainGroups
    : groupBookmarks(bookmarks, (bookmark) => {
      const path = bookmark.folderPath.filter(Boolean);
      return path[path.length - 1] ?? "未分类";
    });

  if (groups.length <= 1) return mapperResult;

  const nodes = groups.map(([label, group], id): MapperNode => {
    const summary = runMapper(group, { ...config, nIntervals: 1, minClusterSize: 1 })
      .graph.nodes[0]?.summary;
    return {
      id,
      size: group.length,
      bookmarkIds: group.map((bookmark) => bookmark.id),
      label,
      summary: summary ?? {
        title: label,
        domains: [],
        folders: [],
        terms: [label],
      },
    };
  });

  const nodeByBookmarkId = new Map<string, number>();
  for (const node of nodes) {
    for (const bookmarkId of node.bookmarkIds) {
      nodeByBookmarkId.set(bookmarkId, node.id);
    }
  }

  return {
    graph: { nodes, edges: [] },
    bookmarks,
    vectors: [],
    nodeLabels: bookmarks.map((bookmark) => nodeByBookmarkId.get(bookmark.id) ?? -1),
    components: Object.fromEntries(nodes.map((node) => [node.id, node.id])),
  };
}

function groupBookmarks(
  bookmarks: ClassifierResult["bookmarks"],
  getKey: (bookmark: ClassifierResult["bookmarks"][number]) => string
): Array<[string, ClassifierResult["bookmarks"]]> {
  const groups = new Map<string, ClassifierResult["bookmarks"]>();
  for (const bookmark of bookmarks) {
    const key = getKey(bookmark).trim() || "其他";
    const group = groups.get(key) ?? [];
    group.push(bookmark);
    groups.set(key, group);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

async function loadCachedResult(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage<
      { action: "getResult" },
      { ok: boolean; result?: ClassifierResult; error?: string }
    >({ action: "getResult" });

    if (response.ok && response.result) {
      updateUI(response.result);
      setStatus(`上次分析 — ${response.result.graph.nodes.length} 节点`);
    }
  } catch {
    // Background might not be ready; retry once
    setTimeout(async () => {
      try {
        const r = await chrome.runtime.sendMessage({ action: "getResult" });
        if (r.ok && r.result) updateUI(r.result);
      } catch {
        // noop
      }
    }, 500);
  }
}

// ---- Event binding ----

btnClassify.addEventListener("click", classify);
btnBack.addEventListener("click", () => {
  if (!rootResult) return;
  isDrilldown = false;
  btnBack.classList.add("hidden");
  folderPicker.classList.remove("hidden");
  viewTitle.classList.add("hidden");
  mainContent.classList.remove("drilldown");
  viewTitle.textContent = selectedFolderName();
  sidebar.classList.add("hidden");
  renderGraph(rootResult);
  setStatus(`全部书签 — ${rootResult.graph.nodes.length} 节点`);
});
window.addEventListener("resize", resizeGraphToContainer);

async function loadBookmarkFolders(): Promise<void> {
  folderMenu.innerHTML = "";
  addFolderOption("", "全部书签", 0, true);

  try {
    const tree = await chrome.bookmarks.getTree();
    const folders: Array<{ id: string; title: string; depth: number; count: number }> = [];

    function countUrls(node: chrome.bookmarks.BookmarkTreeNode): number {
      if (node.url) return 1;
      return (node.children ?? []).reduce((sum, child) => sum + countUrls(child), 0);
    }

    function visit(node: chrome.bookmarks.BookmarkTreeNode, path: string[], depth: number): void {
      if (!node.url && node.id !== "0") {
        const title = node.title || "书签";
        const nextPath = [...path, title];
        const count = countUrls(node);
        if (count > 0) {
          folders.push({
            id: node.id,
            title: `${"  ".repeat(Math.max(0, depth - 1))}${nextPath.join(" / ")} (${count})`,
            depth,
            count,
          });
        }
        for (const child of node.children ?? []) visit(child, nextPath, depth + 1);
        return;
      }
      for (const child of node.children ?? []) visit(child, path, depth);
    }

    for (const root of tree) visit(root, [], 0);
    for (const folder of folders) addFolderOption(folder.id, folder.title, folder.depth);
  } catch (err) {
    console.warn("TopoMark folder list unavailable:", err);
  }
}

function addFolderOption(id: string, title: string, depth: number, selected = false): void {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "folder-option";
  item.dataset.id = id;
  item.dataset.depth = String(depth);
  item.textContent = title.replace(/^\s+/, "");
  item.style.setProperty("--depth", String(Math.min(depth, 6)));
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", selected ? "true" : "false");
  item.addEventListener("click", () => {
    selectedFolderId = id;
    selectedFolderTitle = item.textContent ?? "全部书签";
    folderLabel.textContent = selectedFolderTitle;
    folderMenu.classList.add("hidden");
    for (const option of Array.from(folderMenu.querySelectorAll(".folder-option"))) {
      option.setAttribute("aria-selected", option === item ? "true" : "false");
    }
  });
  folderMenu.appendChild(item);
}

function selectedFolderName(): string {
  return selectedFolderTitle;
}

folderButton.addEventListener("click", () => {
  folderMenu.classList.toggle("hidden");
});

document.addEventListener("click", (event) => {
  if (!folderPicker.contains(event.target as Node)) {
    folderMenu.classList.add("hidden");
  }
});

// ---- Helpers ----

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ---- Init ----

loadBookmarkFolders();
loadCachedResult();
