"use strict";

export type TokenKey = string; // e.g., 'ETH.ethereum', 'USDC.ethereum'

export interface Edge {
  target: TokenKey;
  kind: 'swap' | 'bridge';
  rate: number;
  weight: number;
}

export interface Vertex {
  key: TokenKey;
  chain: string;
  decimals: number;
}

export type RouteGraph = Record<TokenKey, Edge[]>;

export interface RouteStep {
  from: TokenKey;
  to: TokenKey;
  weight: number;
  kind: 'swap' | 'bridge';
}

export interface RouteResult {
  path: TokenKey[];
  totalWeight: number;
  estimatedOutput: number;
  steps: RouteStep[];
}

export async function findBestRoute(
  graph: RouteGraph,
  source: TokenKey,
  target: TokenKey,
  maxHops: number = 4,
): Promise<RouteResult> {
  // --- Data structures for SSSP ---
  const dist: Record<TokenKey, number> = {};
  const prev: Record<TokenKey, TokenKey | null> = {};
  const visited: Set<TokenKey> = new Set();

  for (const token in graph) {
    dist[token] = Infinity;
    prev[token] = null;
  }
  dist[source] = 0;

  // --- Main loop (Bellman-Ford with early stopping) ---
  let changed = true;
  let hop = 0;
  
  while (changed && hop < maxHops) {
    changed = false;
    hop++;

    for (const u in graph) {
      if (dist[u] === Infinity) continue;

      for (const edge of graph[u]) {
        const v = edge.target;
        const w = edge.weight;

        if (dist[u] + w < dist[v]) {
          dist[v] = dist[u] + w;
          prev[v] = u;
          changed = true;
        }
      }
    }

    // Early stopping if we've found the target
    if (dist[target] < Infinity && !changed) break;
  }

  // --- Path reconstruction ---
  if (dist[target] === Infinity) {
    throw new Error(`No route found from ${source} to ${target}`);
  }

  const path: TokenKey[] = [];
  const steps: RouteStep[] = [];
  let current: TokenKey | null = target;

  while (current !== null) {
    path.unshift(current);
    current = prev[current];
  }

  // Build steps
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    const edge = graph[from].find(e => e.target === to)!;

    steps.push({
      from,
      to,
      weight: edge.weight,
      kind: edge.kind,
    });
  }

  return {
    path,
    totalWeight: dist[target],
    estimatedOutput: Math.exp(-dist[target]),
    steps,
  };
}