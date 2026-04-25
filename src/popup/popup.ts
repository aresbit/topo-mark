/**
 * TopoMark — Popup Script
 *
 * Coordinates the classification workflow and renders
 * the Mapper graph visualization.
 */

import type { ClassifierResult, MapperNode, MapperConfig } from "../algorithm/types";
import { GraphView } from "../components/graph-view";

// ---- DOM refs ----
const btnClassify = document.getElementById("btnClassify") as HTMLButtonElement;
const btnOpenAll = document.getElementById("btnOpenAll") as HTMLButtonElement;
const selectIntervals = document.getElementById("selectIntervals") as HTMLSelectElement;
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
let graphView: GraphView | null = null;

function setLoading(on: boolean): void {
  loading.classList.toggle("hidden", !on);
  if (on) mainContent.classList.add("hidden");
}

function setStatus(msg: string): void {
  statusText.textContent = msg;
}

function updateUI(result: ClassifierResult): void {
  currentResult = result;

  if (result.bookmarks.length === 0) {
    emptyState.classList.remove("hidden");
    mainContent.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  mainContent.classList.remove("hidden");
  bookmarkCount.textContent = `${result.bookmarks.length} 书签`;

  const nodeCount = result.graph.nodes.length;
  btnOpenAll.disabled = nodeCount === 0;

  // Render graph
  renderGraph(result);
}

function renderGraph(result: ClassifierResult): void {
  // Resize canvas
  const container = canvas.parentElement!;
  const w = container.clientWidth;
  const h = container.clientHeight || 400;
  canvas.width = w;
  canvas.height = h;

  if (graphView) graphView.destroy();
  graphView = new GraphView(canvas);

  graphView.setOnNodeClick((node: MapperNode) => {
    showNodeDetail(node, result);
  });

  graphView.renderAnimated(result.graph, result.components, w, h);

  // Mouse events
  canvas.onmousemove = (e) => graphView?.handleMouseMove(e);
  canvas.onclick = (e) => {
    if (!graphView || !currentResult) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = graphView.getNodeAt(currentResult.graph, x, y);
    if (node) showNodeDetail(node, currentResult);
  };
}

function showNodeDetail(node: MapperNode, result: ClassifierResult): void {
  sidebar.classList.remove("hidden");

  // Find the full node data
  const fullNode = result.graph.nodes.find((n) => n.id === node.id);
  if (!fullNode) {
    sidebarTitle.textContent = `节点 #${node.id}`;
    sidebarBookmarks.innerHTML = "";
    return;
  }

  sidebarTitle.textContent = `节点 #${node.id} (${fullNode.size} 书签)`;
  sidebarBookmarks.innerHTML = "";

  for (const bmId of fullNode.bookmarkIds.slice(0, 50)) {
    const bm = result.bookmarks.find((b) => b.id === bmId);
    if (!bm) continue;

    const div = document.createElement("div");
    div.className = "sidebar-item";
    div.innerHTML = `
      <div class="title">${escapeHtml(bm.title || "无标题")}</div>
      <div class="url">${escapeHtml(bm.url)}</div>
    `;
    div.onclick = () => chrome.tabs.create({ url: bm.url });
    div.style.cursor = "pointer";
    sidebarBookmarks.appendChild(div);
  }

  if (fullNode.bookmarkIds.length > 50) {
    const more = document.createElement("div");
    more.className = "sidebar-item";
    more.innerHTML = `<div class="url">...还有 ${fullNode.bookmarkIds.length - 50} 个书签</div>`;
    sidebarBookmarks.appendChild(more);
  }
}

// ---- Message passing ----

async function classify(): Promise<void> {
  setLoading(true);
  setStatus("正在分析书签拓扑结构...");
  btnClassify.disabled = true;

  try {
    const config: MapperConfig = {
      nIntervals: parseInt(selectIntervals.value, 10),
      overlapFrac: 0.3,
      clusterThreshold: 0.6,
      minClusterSize: 2,
      featureDim: 100,
      pcaDim: 1,
    };

    const response = await chrome.runtime.sendMessage<
      { action: string; config?: MapperConfig },
      { ok: boolean; result?: ClassifierResult; error?: string }
    >({ action: "classify", config });

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

btnOpenAll.addEventListener("click", () => {
  if (!currentResult) return;
  const urls = currentResult.bookmarks.map((b) => b.url);
  for (const url of urls) {
    chrome.tabs.create({ url });
  }
});

// ---- Helpers ----

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ---- Init ----

loadCachedResult();
