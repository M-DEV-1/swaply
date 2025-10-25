"use strict";

import { TokenKey, Edge, Vertex, RouteGraph } from '../core/router';

interface SimulationConfig {
  numVertices: number;
  edgesPerVertex: number;
  chains: string[];
  minLiquidity: number;
  maxLiquidity: number;
  minRate: number;
  maxRate: number;
}

export function generateRandomGraph(config: SimulationConfig): {
  graph: RouteGraph;
  vertices: Vertex[];
} {
  const vertices: Vertex[] = [];
  const graph: RouteGraph = {};

  // Generate vertices (tokens) across different chains
  for (let i = 0; i < config.numVertices; i++) {
    const chain = config.chains[Math.floor(Math.random() * config.chains.length)];
    const token: TokenKey = `TOKEN${i}.${chain}`;
    const symbol = `T${i}`;
    vertices.push({
      key: token,
      symbol,
      chain,
    });
    graph[token] = [];
  }

  // Generate edges ensuring we hit the target edge count
  const totalEdges = config.numVertices * config.edgesPerVertex;
  let edgesCreated = 0;

  while (edgesCreated < totalEdges) {
    const fromIdx = Math.floor(Math.random() * vertices.length);
    const toIdx = Math.floor(Math.random() * vertices.length);

    // Avoid self-loops and duplicate edges
    if (fromIdx === toIdx || graph[vertices[fromIdx].key].some(e => e.target === vertices[toIdx].key)) {
      continue;
    }

    const rate = config.minRate + Math.random() * (config.maxRate - config.minRate);
    const gas = 0.0001 + Math.random() * 0.001; // Small gas cost
    const bridgeFee = vertices[fromIdx].chain === vertices[toIdx].chain ? undefined : 0.001;

    const edge: Edge = {
      target: vertices[toIdx].key,
      kind: vertices[fromIdx].chain === vertices[toIdx].chain ? 'swap' : 'bridge',
      rate,
      gas,
      bridgeFee,
      dex: vertices[fromIdx].chain === vertices[toIdx].chain ? 'SyntheticDEX' : undefined,
      poolAddress: vertices[fromIdx].chain === vertices[toIdx].chain ? `0xSYN${fromIdx}${toIdx}` : undefined,
    };

    graph[vertices[fromIdx].key].push(edge);
    edgesCreated++;
  }

  return { graph, vertices };
}

// Helper function to validate if the generated graph meets requirements
export function validateGraph(graph: RouteGraph): {
  totalEdges: number;
  maxEdgesForVertex: number;
  avgEdgesPerVertex: number;
} {
  let totalEdges = 0;
  let maxEdges = 0;

  Object.values(graph).forEach(edges => {
    totalEdges += edges.length;
    maxEdges = Math.max(maxEdges, edges.length);
  });

  return {
    totalEdges,
    maxEdgesForVertex: maxEdges,
    avgEdgesPerVertex: totalEdges / Object.keys(graph).length
  };
}