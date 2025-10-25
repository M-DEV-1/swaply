import { RouteGraph, TokenKey, RouteResult, Edge } from '../router';

export interface PSBDijkstraMetrics {
  executionTimeMs: number;
  gasEstimate: number;
  visitedNodes: number;
  pathLength: number;
  barrierCount: number;
  pivotsFound: number;
  frontierReductions: number;
  levelCount: number;
}

/**
 * PSB (Post-Sorting Barrier) Dijkstra Algorithm
 * Reference: Duan et al. 
 * 
 * Key Innovation: Reduces frontier size from Θ(n) to |U_e|/log^Ω(1)(n) using:
 * 1. FindPivots procedure with k-step Bellman-Ford relaxation
 * 2. Pivot identification (roots of SPT subtrees with ≥k vertices)
 * 3. Recursive BMSSP (Bounded Multi-Source Shortest Path) structure
 * 
 * Complexity: O(m log^(2/3) n) - breaks O(m + n log n) barrier
 */
export function psbDijkstra(
  graph: RouteGraph,
  source: TokenKey,
  target: TokenKey,
  maxHops: number = 4
): { route: RouteResult; metrics: PSBDijkstraMetrics } {
  const startTime = performance.now();

  const n = Object.keys(graph).length;

  // Calculate parameters from paper (Section 3.1)
  // k := ⌊log^(1/3)(n)⌋
  // t := ⌊log^(2/3)(n)⌋
  const k = Math.max(2, Math.floor(Math.pow(Math.log(n) / Math.log(2), 1 / 3)));
  const t = Math.max(2, Math.floor(Math.pow(Math.log(n) / Math.log(2), 2 / 3)));

  // Metrics tracking
  let visitedCount = 0;
  let barrierCount = 0;
  let pivotsFound = 0;
  let frontierReductions = 0;
  let levelCount = 0;

  // Global distance and predecessor arrays
  const dist: Record<TokenKey, number> = {};
  const prev: Record<TokenKey, TokenKey | null> = {};
  const completed = new Set<TokenKey>();

  // Initialize
  for (const token in graph) {
    dist[token] = Infinity;
    prev[token] = null;
  }
  dist[source] = 0;

  /**
   * FindPivots Procedure (Algorithm 1 from paper)
   * Runs k steps of Bellman-Ford relaxation, then identifies pivots
   * Returns: { pivots: P, completed: W }
   * Where |P| ≤ |W|/k (frontier reduction!)
   */
  function findPivots(
    B: number,
    S: Set<TokenKey>
  ): { pivots: Set<TokenKey>; completedVertices: Set<TokenKey> } {

    const W = new Set<TokenKey>(S);
    const Ws: Array<Set<TokenKey>> = [new Set(S)]; // W_0, W_1, ..., W_k

    // Run k steps of edge relaxation (Lines 4-11 from Algorithm 1)
    for (let i = 1; i <= k; i++) {
      const Wi = new Set<TokenKey>();

      for (const u of Ws[i - 1]) {
        if (!graph[u]) continue;

        for (const edge of graph[u]) {
          const v = edge.target;
          const weight = edge.rate && edge.rate > 0
            ? -Math.log(edge.rate) + (edge.gas || 0)
            : Number.MAX_VALUE / 2;

          const newDist = dist[u] + weight;

          // Relaxation with bound B
          if (newDist <= dist[v] && newDist < B) {
            dist[v] = newDist;
            prev[v] = u;

            if (newDist < B) {
              Wi.add(v);
              W.add(v);
            }
          }
        }
      }

      Ws.push(Wi);

      // Early exit if W grows too large (Line 12-14)
      if (W.size > k * S.size) {
        return {
          pivots: S,
          completedVertices: W
        };
      }
    }

    // Build forest F of predecessor edges (Line 15)
    // F = {(u,v) ∈ E : u,v ∈ W, dist[v] = dist[u] + w_uv}
    const forest: Record<TokenKey, Set<TokenKey>> = {};
    for (const v of W) {
      forest[v] = new Set();
    }

    for (const u of W) {
      if (!graph[u]) continue;

      for (const edge of graph[u]) {
        const v = edge.target;
        if (!W.has(v)) continue;

        const weight = edge.rate && edge.rate > 0
          ? -Math.log(edge.rate) + (edge.gas || 0)
          : Number.MAX_VALUE / 2;

        // Check if (u,v) is in shortest path tree
        if (Math.abs(dist[v] - (dist[u] + weight)) < 1e-10 && prev[v] === u) {
          if (!forest[u]) forest[u] = new Set();
          forest[u].add(v);
        }
      }
    }

    // Count subtree sizes for each vertex in S
    function countSubtree(v: TokenKey, visited: Set<TokenKey> = new Set()): number {
      if (visited.has(v)) return 0;
      visited.add(v);

      let count = 1;
      if (forest[v]) {
        for (const child of forest[v]) {
          count += countSubtree(child, visited);
        }
      }
      return count;
    }

    // Identify pivots: vertices in S with subtree size ≥ k (Line 16)
    const pivots = new Set<TokenKey>();
    for (const u of S) {
      const subtreeSize = countSubtree(u);
      if (subtreeSize >= k) {
        pivots.add(u);
      }
    }

    pivotsFound += pivots.size;

    return {
      pivots,
      completedVertices: W
    };
  }

  /**
   * BMSSP Procedure (Algorithm 3 from paper)
   * Bounded Multi-Source Shortest Path with recursive frontier reduction
   */
  function BMSSP(
    level: number,
    B: number,
    S: Set<TokenKey>
  ): { boundaryReached: number; completedVertices: Set<TokenKey> } {

    levelCount = Math.max(levelCount, level);

    // Base case (l = 0): Run simple Dijkstra-like on singleton
    if (level === 0 || S.size === 0) {
      const localCompleted = new Set<TokenKey>();

      for (const s of S) {
        if (dist[s] < B && !completed.has(s)) {
          completed.add(s);
          localCompleted.add(s);
          visitedCount++;

          // Relax edges from this vertex
          if (graph[s]) {
            for (const edge of graph[s]) {
              const v = edge.target;
              const weight = edge.rate && edge.rate > 0
                ? -Math.log(edge.rate) + (edge.gas || 0)
                : Number.MAX_VALUE / 2;

              const newDist = dist[s] + weight;
              if (newDist < dist[v] && newDist < B) {
                dist[v] = newDist;
                prev[v] = s;
              }
            }
          }
        }
      }

      return {
        boundaryReached: B,
        completedVertices: localCompleted
      };
    }

    // Step 1: Find pivots using FindPivots (Line 4)
    const { pivots: P, completedVertices: W } = findPivots(B, S);

    barrierCount++;
    frontierReductions++;

    // Mark vertices in W with dist < B as completed
    for (const v of W) {
      if (dist[v] < B && !completed.has(v)) {
        completed.add(v);
        visitedCount++;
      }
    }

    // Step 2: Recursive calls on pivots (Lines 8-21)
    const U = new Set<TokenKey>(W);
    let Bi = B;
    let i = 0;
    const maxIterations = Math.ceil(Math.pow(2, t)); // Safety limit

    while (U.size < k * Math.pow(2, level * t) && P.size > 0 && i < maxIterations) {
      i++;

      // Pull subset Si from P (up to 2^((level-1)*t) vertices)
      const targetSize = Math.min(P.size, Math.pow(2, (level - 1) * t));
      const Si = new Set<TokenKey>();
      const pArray = Array.from(P);

      for (let j = 0; j < targetSize && j < pArray.length; j++) {
        Si.add(pArray[j]);
        P.delete(pArray[j]);
      }

      if (Si.size === 0) break;

      // Recursive call at level l-1 (Line 11)
      const { boundaryReached: BPrime, completedVertices: Ui } = BMSSP(level - 1, Bi, Si);

      // Add completed vertices from recursive call
      for (const v of Ui) {
        U.add(v);
        if (!completed.has(v)) {
          completed.add(v);
          visitedCount++;
        }
      }

      // Relax edges from newly completed vertices (Lines 14-20)
      for (const u of Ui) {
        if (!graph[u]) continue;

        for (const edge of graph[u]) {
          const v = edge.target;
          const weight = edge.rate && edge.rate > 0
            ? -Math.log(edge.rate) + (edge.gas || 0)
            : Number.MAX_VALUE / 2;

          const newDist = dist[u] + weight;

          if (newDist <= dist[v]) {
            dist[v] = newDist;
            prev[v] = u;
          }
        }
      }

      // Update boundary
      Bi = Math.min(Bi, BPrime);

      // Early termination if target reached
      if (dist[target] < Bi) {
        break;
      }
    }

    return {
      boundaryReached: Bi,
      completedVertices: U
    };
  }

  // Main execution: Top-level call
  const maxLevel = Math.ceil(Math.log(n) / t);
  BMSSP(maxLevel, Infinity, new Set([source]));

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

  const metrics: PSBDijkstraMetrics = {
    executionTimeMs: endTime - startTime,
    gasEstimate: gasTotal,
    visitedNodes: visitedCount,
    pathLength: path.length - 1,
    barrierCount,
    pivotsFound,
    frontierReductions,
    levelCount
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