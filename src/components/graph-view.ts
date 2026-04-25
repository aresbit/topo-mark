/**
 * GraphView — Renders the Mapper graph onto an HTML Canvas.
 *
 * Uses a simple force-directed layout:
 *  - Connected nodes attract each other
 *  - All nodes repel each other
 *  - Iterate for `iterations` steps
 */

import type { MapperGraph, MapperNode, ComponentMap } from "../algorithm/types";

interface Point {
  x: number;
  y: number;
}

const COLORS = [
  "#5E8CFF", "#5AC8FA", "#64D2A6", "#B8D66F", "#FFD166",
  "#F7A072", "#FF7A90", "#C792EA", "#A0A7B8", "#8BD3DD",
  "#C9B79C", "#7DD3C7", "#9BB5FF", "#D7A9E3", "#F2C57C",
];

function truncateLabel(label: string, maxLength: number): string {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;
}

function colorIndexForNode(node: MapperNode): number {
  const key = `${node.label ?? ""}:${node.summary?.title ?? ""}:${node.id}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % COLORS.length;
}

export class GraphView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private positions: Map<number, Point> = new Map();
  private animationId: number = 0;
  private viewportWidth: number = 0;
  private viewportHeight: number = 0;
  private graph: MapperGraph | null = null;
  private components: ComponentMap = {};
  private hoveredNode: MapperNode | null = null;
  private onNodeClick: ((node: MapperNode) => void) | null = null;
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private isPanning: boolean = false;
  private didPan: boolean = false;
  private lastPointer: Point = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  setOnNodeClick(cb: (node: MapperNode) => void): void {
    this.onNodeClick = cb;
  }

  render(
    graph: MapperGraph,
    components: ComponentMap,
    width: number,
    height: number
  ): void {
    this.graph = graph;
    this.components = components;
    this.configureCanvas(width, height);
    this.resetView();
    this.initPositions(graph, width, height);

    // Run force layout
    this.runLayout(graph, width, height);

    // Draw
    this.draw(graph, components, width, height);
  }

  renderAnimated(
    graph: MapperGraph,
    components: ComponentMap,
    width: number,
    height: number
  ): void {
    this.graph = graph;
    this.components = components;
    this.configureCanvas(width, height);
    this.resetView();
    this.initPositions(graph, width, height);

    // Animate force layout
    const maxIter = 50;
    let iter = 0;

    const tick = () => {
      this.runLayoutStep(graph, width, height);
      this.draw(graph, components, width, height);
      iter++;
      if (iter < maxIter) {
        this.animationId = requestAnimationFrame(tick);
      }
    };

    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = requestAnimationFrame(tick);
  }

  resize(
    width: number,
    height: number,
    graph: MapperGraph,
    components: ComponentMap
  ): void {
    this.graph = graph;
    this.components = components;
    if (this.animationId) cancelAnimationFrame(this.animationId);

    const oldWidth = this.viewportWidth || width;
    const oldHeight = this.viewportHeight || height;
    const scaleX = oldWidth > 0 ? width / oldWidth : 1;
    const scaleY = oldHeight > 0 ? height / oldHeight : 1;

    this.configureCanvas(width, height);
    for (const pos of this.positions.values()) {
      pos.x *= scaleX;
      pos.y *= scaleY;
    }
    this.clampPositions(graph, width, height);
    this.draw(graph, components, width, height);
  }

  zoomBy(delta: number, screenX: number, screenY: number): void {
    const nextScale = Math.max(0.35, Math.min(4, this.scale * delta));
    const world = this.screenToWorld(screenX, screenY);
    this.scale = nextScale;
    this.offsetX = screenX - world.x * this.scale;
    this.offsetY = screenY - world.y * this.scale;
    this.redraw();
  }

  resetZoom(): void {
    this.resetView();
    this.redraw();
  }

  handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y);
  }

  handlePointerDown(e: PointerEvent): void {
    this.isPanning = true;
    this.didPan = false;
    this.lastPointer = this.eventPoint(e);
    this.canvas.setPointerCapture(e.pointerId);
  }

  handlePointerMove(e: PointerEvent): void {
    const point = this.eventPoint(e);
    if (this.isPanning) {
      const dx = point.x - this.lastPointer.x;
      const dy = point.y - this.lastPointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.didPan = true;
      this.offsetX += dx;
      this.offsetY += dy;
      this.lastPointer = point;
      this.redraw();
      return;
    }
    const nextHovered = this.findNodeAt(point.x, point.y);
    if (nextHovered?.id !== this.hoveredNode?.id) {
      this.hoveredNode = nextHovered;
      this.redraw();
    }
    this.canvas.style.cursor = this.hoveredNode ? "pointer" : "grab";
  }

  handlePointerUp(e: PointerEvent): void {
    const point = this.eventPoint(e);
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.releasePointerCapture(e.pointerId);
      this.canvas.style.cursor = "grab";
      if (!this.didPan) {
        const node = this.findNodeAt(point.x, point.y);
        if (node) this.onNodeClick?.(node);
      }
    }
  }

  private configureCanvas(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private resetView(): void {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  private initPositions(graph: MapperGraph, w: number, h: number): void {
    const padding = 60;
    this.positions.clear();
    for (const node of this.graph?.nodes ?? []) {
      this.positions.set(node.id, {
        x: padding + Math.random() * (w - 2 * padding),
        y: padding + Math.random() * (h - 2 * padding),
      });
    }
  }

  private runLayout(graph: MapperGraph, w: number, h: number): void {
    for (let i = 0; i < 50; i++) {
      this.runLayoutStep(graph, w, h);
    }
  }

  private runLayoutStep(graph: MapperGraph, w: number, h: number): void {
    const repulsion = 5000;
    const attraction = 0.01;
    const damping = 0.85;
    const padding = 60;

    const forces = new Map<number, Point>();
    for (const node of this.graph?.nodes ?? []) {
      forces.set(node.id, { x: 0, y: 0 });
    }

    // Repulsion: all nodes repel each other
    const nodeIds = graph.nodes.map((n) => n.id);
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = this.positions.get(nodeIds[i]!)!;
        const b = this.positions.get(nodeIds[j]!)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces.get(nodeIds[i]!)!.x -= fx;
        forces.get(nodeIds[i]!)!.y -= fy;
        forces.get(nodeIds[j]!)!.x += fx;
        forces.get(nodeIds[j]!)!.y += fy;
      }
    }

    // Attraction: connected nodes attract
    const edgeSet = new Set<string>();
    for (const edge of graph.edges) {
      const key = `${Math.min(edge.source, edge.target)}-${Math.max(edge.source, edge.target)}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      const a = this.positions.get(edge.source)!;
      const b = this.positions.get(edge.target)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = attraction * dist;
      forces.get(edge.source)!.x += dx * force;
      forces.get(edge.source)!.y += dy * force;
      forces.get(edge.target)!.x -= dx * force;
      forces.get(edge.target)!.y -= dy * force;
    }

    // Apply forces
    for (const node of this.graph?.nodes ?? []) {
      const pos = this.positions.get(node.id)!;
      const f = forces.get(node.id)!;
      pos.x += f.x * damping;
      pos.y += f.y * damping;
    }
    this.clampPositions(graph, w, h);
  }

  private clampPositions(graph: MapperGraph, w: number, h: number): void {
    const padding = 60;
    const maxX = Math.max(padding, w - padding);
    const maxY = Math.max(padding, h - padding);
    for (const node of this.graph?.nodes ?? []) {
      const pos = this.positions.get(node.id)!;
      // Clamp to canvas bounds
      pos.x = Math.max(padding, Math.min(maxX, pos.x));
      pos.y = Math.max(padding, Math.min(maxY, pos.y));
    }
  }

  private draw(
    graph: MapperGraph,
    components: ComponentMap,
    w: number,
    h: number
  ): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Draw edges
    ctx.lineWidth = 1.5;
    for (const edge of graph.edges) {
      const a = this.positions.get(edge.source);
      const b = this.positions.get(edge.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "rgba(225,230,240,0.12)";
      ctx.stroke();
    }

    // Draw nodes
    for (const node of graph.nodes) {
      const pos = this.positions.get(node.id);
      if (!pos) continue;

      const color = COLORS[colorIndexForNode(node)]!;
      const radius = this.getNodeRadius(node);

      const isHovered = this.hoveredNode?.id === node.id;

      // Glow effect
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = color + "40";
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? color : color + "d9";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Size label for large nodes
      if (node.size > 5) {
        ctx.fillStyle = "rgba(255,255,255,0.82)";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${node.size}`, pos.x, pos.y + 3);
      }

      if (node.label && radius > 16) {
        ctx.fillStyle = "rgba(236,240,248,0.78)";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(truncateLabel(node.label, 16), pos.x, pos.y + radius + 6);
      }
    }
    ctx.restore();
  }

  /** Handle mouse move for hover effects */
  handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    this.hoveredNode = this.findNodeAt(mx, my);

    this.canvas.style.cursor = this.hoveredNode ? "pointer" : "default";
  }

  handleClick(e: MouseEvent): void {
    if (!this.onNodeClick) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const node = this.findNodeAt(mx, my);
    if (node) this.onNodeClick(node);
  }

  /** Get full node data at a position */
  getNodeAt(graph: MapperGraph, x: number, y: number): MapperNode | null {
    this.graph = graph;
    return this.findNodeAt(x, y);
  }

  private findNodeAt(x: number, y: number): MapperNode | null {
    const world = this.screenToWorld(x, y);
    let bestNode: MapperNode | null = null;
    let bestDistance = Infinity;
    for (const node of this.graph?.nodes ?? []) {
      const pos = this.positions.get(node.id);
      if (!pos) continue;
      const dx = world.x - pos.x;
      const dy = world.y - pos.y;
      const distance = dx * dx + dy * dy;
      const hitRadius = this.getHitRadius(node);
      if (distance <= hitRadius * hitRadius && distance < bestDistance) {
        bestNode = node;
        bestDistance = distance;
      }
    }
    return bestNode;
  }

  private getNodeRadius(node: MapperNode): number {
    return Math.min(74, 7 + Math.sqrt(Math.max(1, node.size)) * 3.2);
  }

  private getHitRadius(node: MapperNode): number {
    return Math.max(24, this.getNodeRadius(node) + 8);
  }

  private screenToWorld(x: number, y: number): Point {
    return {
      x: (x - this.offsetX) / this.scale,
      y: (y - this.offsetY) / this.scale,
    };
  }

  private eventPoint(e: MouseEvent | PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private redraw(): void {
    if (!this.graph) return;
    this.draw(this.graph, this.components, this.viewportWidth, this.viewportHeight);
  }

  destroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }
}
