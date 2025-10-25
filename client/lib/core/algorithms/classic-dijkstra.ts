// client/lib/core/algorithms/classic-dijkstra.ts
import { RouteGraph, TokenKey, RouteResult, Edge } from '../router';

export interface DijkstraMetrics {
  executionTimeMs: number;
  gasEstimate: number;
  visitedNodes: number;
  pathLength: number;
  heapOperations: number; // Track heap operations for analysis
}

/**
 * Classic Dijkstra's Algorithm with Proper Min-Heap
 * Complexity: O(m + n log n) with binary heap
 * Reference: Dijkstra (1959), Fredman-Tarjan (1987)
 */
export function classicDijkstra(
  graph: RouteGraph,
  source: TokenKey,
  target: TokenKey,
  maxHops: number = 4,
): { route: RouteResult; metrics: DijkstraMetrics } {
  const startTime = performance.now();
  
  // Priority queue implementation (min-heap)
  class MinHeap {
    private heap: Array<{ token: TokenKey; dist: number }> = [];
    private positions: Map<TokenKey, number> = new Map();
    public operations = 0;

    private parent(i: number): number {
      return Math.floor((i - 1) / 2);
    }

    private leftChild(i: number): number {
      return 2 * i + 1;
    }

    private rightChild(i: number): number {
      return 2 * i + 2;
    }

    private swap(i: number, j: number): void {
      this.operations++;
      const temp = this.heap[i];
      this.heap[i] = this.heap[j];
      this.heap[j] = temp;
      
      // Update positions
      this.positions.set(this.heap[i].token, i);
      this.positions.set(this.heap[j].token, j);
    }

    private heapifyUp(i: number): void {
      while (i > 0 && this.heap[i].dist < this.heap[this.parent(i)].dist) {
        this.swap(i, this.parent(i));
        i = this.parent(i);
      }
    }

    private heapifyDown(i: number): void {
      let minIndex = i;
      const left = this.leftChild(i);
      const right = this.rightChild(i);

      if (left < this.heap.length && this.heap[left].dist < this.heap[minIndex].dist) {
        minIndex = left;
      }

      if (right < this.heap.length && this.heap[right].dist < this.heap[minIndex].dist) {
        minIndex = right;
      }

      if (i !== minIndex) {
        this.swap(i, minIndex);
        this.heapifyDown(minIndex);
      }
    }

    insert(token: TokenKey, dist: number): void {
      this.operations++;
      const pos = this.heap.length;
      this.heap.push({ token, dist });
      this.positions.set(token, pos);
      this.heapifyUp(pos);
    }

    extractMin(): { token: TokenKey; dist: number } | null {
      if (this.heap.length === 0) return null;
      
      this.operations++;
      const min = this.heap[0];
      const last = this.heap.pop()!;
      
      if (this.heap.length > 0) {
        this.heap[0] = last;
        this.positions.set(last.token, 0);
        this.heapifyDown(0);
      }
      
      this.positions.delete(min.token);
      return min;
    }

    decreaseKey(token: TokenKey, newDist: number): void {
      const pos = this.positions.get(token);
      if (pos === undefined) {
        this.insert(token, newDist);
        return;
      }

      this.operations++;
      if (newDist < this.heap[pos].dist) {
        this.heap[pos].dist = newDist;
        this.heapifyUp(pos);
      }
    }

    isEmpty(): boolean {
      return this.heap.length === 0;
    }

    size(): number {
      return this.heap.length;
    }
  }

  // Initialize data structures
  const dist: Record<TokenKey, number> = {};
  const prev: Record<TokenKey, TokenKey | null> = {};
  const visited = new Set<TokenKey>();
  const hopCount: Record<TokenKey, number> = {}; // Track hops for maxHops limit
  let visitedCount = 0;

  // Initialize distances
  for (const token in graph) {
    dist[token] = Infinity;
    prev[token] = null;
    hopCount[token] = Infinity;
  }
  dist[source] = 0;
  hopCount[source] = 0;

  // Initialize min-heap with source
  const pq = new MinHeap();
  pq.insert(source, 0);

  // Main Dijkstra loop
  while (!pq.isEmpty()) {
    const current = pq.extractMin();
    if (!current) break;

    const { token: u, dist: currentDist } = current;

    // Skip if already visited (stale entry)
    if (visited.has(u)) continue;
    
    // Early termination if target reached
    if (u === target) break;

    // Skip if exceeded max hops
    if (hopCount[u] >= maxHops) continue;

    visited.add(u);
    visitedCount++;

    // Relax all outgoing edges
    for (const edge of graph[u] || []) {
      const v = edge.target;
      
      // Skip if already visited
      if (visited.has(v)) continue;

      // Calculate edge weight: -ln(rate) for maximizing output
      // Add gas cost as penalty
      const weight = edge.rate && edge.rate > 0 
        ? -Math.log(edge.rate) + (edge.gas || 0)
        : Number.MAX_VALUE / 2;

      const newDist = currentDist + weight;
      const newHops = hopCount[u] + 1;

      // Relaxation step
      if (newDist < dist[v] && newHops <= maxHops) {
        dist[v] = newDist;
        prev[v] = u;
        hopCount[v] = newHops;
        pq.decreaseKey(v, newDist);
      }
    }
  }

  // Check if target is reachable
  if (dist[target] === Infinity) {
    const endTime = performance.now();
    throw new Error(`No route found from ${source} to ${target}`);
  }

  // Build path by backtracking
  const path: TokenKey[] = [];
  const steps: RouteResult['steps'] = [];
  let gasTotal = 0;
  let current: TokenKey | null = target;

  while (current && prev[current]) {
    path.unshift(current);
    const prevToken = prev[current];
    
    if (prevToken && graph[prevToken]) {
      const edge = graph[prevToken].find((e: Edge) => e.target === current);
      if (edge) {
        const weight = edge.rate && edge.rate > 0
          ? -Math.log(edge.rate) + (edge.gas || 0)
          : 0;
        
        steps.unshift({
          from: prevToken,
          to: current,
          weight,
          kind: edge.kind || 'swap',
          details: edge
        });
        
        gasTotal += edge.gas || 0;
      }
    }
    current = prev[current];
  }
  
  if (current) path.unshift(current);

  const endTime = performance.now();

  const metrics: DijkstraMetrics = {
    executionTimeMs: endTime - startTime,
    gasEstimate: gasTotal,
    visitedNodes: visitedCount,
    pathLength: path.length - 1,
    heapOperations: pq.operations
  };

  return {
    route: {
      path,
      totalWeight: dist[target],
      estimatedOutput: Math.exp(-dist[target]),
      steps
    },
    metrics
  };
}