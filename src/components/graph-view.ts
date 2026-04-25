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
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
  "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe",
  "#008080", "#e6beff", "#9a6324", "#fffac8", "#800000",
  "#aaffc3", "#808000", "#ffd8b1", "#000075", "#808080",
  "#000000",
];

export class GraphView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private positions: Map<number, Point> = new Map();
  private animationId: number = 0;
  private hoveredNode: MapperNode | null = null;
  private onNodeClick: ((node: MapperNode) => void) | null = null;

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
    this.canvas.width = width;
    this.canvas.height = height;
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
    this.canvas.width = width;
    this.canvas.height = height;
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

  private initPositions(graph: MapperGraph, w: number, h: number): void {
    const padding = 60;
    this.positions.clear();
    for (const node of graph.nodes) {
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
    for (const node of graph.nodes) {
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
    for (const node of graph.nodes) {
      const pos = this.positions.get(node.id)!;
      const f = forces.get(node.id)!;
      pos.x += f.x * damping;
      pos.y += f.y * damping;
      // Clamp to canvas bounds
      pos.x = Math.max(padding, Math.min(w - padding, pos.x));
      pos.y = Math.max(padding, Math.min(h - padding, pos.y));
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
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    // Draw edges
    ctx.lineWidth = 1.5;
    for (const edge of graph.edges) {
      const a = this.positions.get(edge.source);
      const b = this.positions.get(edge.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.stroke();
    }

    // Draw nodes
    for (const node of graph.nodes) {
      const pos = this.positions.get(node.id);
      if (!pos) continue;

      const comp = components[node.id] ?? 0;
      const color = COLORS[comp % COLORS.length]!;
      const radius = 6 + Math.min(node.size, 30) * 1.2;

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
      ctx.fillStyle = isHovered ? color : color + "cc";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Size label for large nodes
      if (node.size > 5) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${node.size}`, pos.x, pos.y + 3);
      }
    }
  }

  /** Handle mouse move for hover effects */
  handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // We need the graph data from outside, so this is a simple hit test
    // based on stored positions. The caller provides graph.
    this.hoveredNode = null;
    for (const [id, pos] of this.positions) {
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (dx * dx + dy * dy < 400) {
        // Approx 20px radius
        this.hoveredNode = { id, size: 0, bookmarkIds: [] };
        break;
      }
    }

    this.canvas.style.cursor = this.hoveredNode ? "pointer" : "default";
  }

  handleClick(e: MouseEvent): void {
    if (!this.onNodeClick) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const [id, pos] of this.positions) {
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (dx * dx + dy * dy < 400) {
        const node = { id, size: 0, bookmarkIds: [] };
        this.onNodeClick(node);
        break;
      }
    }
  }

  /** Get full node data at a position */
  getNodeAt(graph: MapperGraph, x: number, y: number): MapperNode | null {
    for (const node of graph.nodes) {
      const pos = this.positions.get(node.id);
      if (!pos) continue;
      const dx = x - pos.x;
      const dy = y - pos.y;
      if (dx * dx + dy * dy < 400) return node;
    }
    return null;
  }

  destroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }
}
