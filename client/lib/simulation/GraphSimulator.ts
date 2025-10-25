"use strict";

import { TokenKey, Edge, RouteGraph } from '../core/router';

// Mock implementation for testing large graphs
export interface SimulatedVertex {
  key: TokenKey;
  chain: string;
  decimals: number;
}

export interface SimulatedEdge {
  source: TokenKey;
  target: TokenKey;
  rate: number;
  liquidity: number;
  kind: 'swap' | 'bridge';
  weight: number;
}

export class GraphSimulator {
  private vertices: SimulatedVertex[] = [];
  private edges: SimulatedEdge[] = [];
  private graph: RouteGraph = {};

  constructor(private config: {
    numVertices: number;
    edgesPerVertex: number;
    chains: string[];
    priceRange: [number, number];
    liquidityRange: [number, number];
  }) {
    this.generateVertices();
    this.generateEdges();
    this.buildGraph();
  }

  private generateVertices() {
    for (let i = 0; i < this.config.numVertices; i++) {
      const chain = this.config.chains[Math.floor(Math.random() * this.config.chains.length)];
      const vertex: SimulatedVertex = {
        key: `TOKEN${i}.${chain}`,
        chain,
        decimals: 18,
      };
      this.vertices.push(vertex);
      this.graph[vertex.key] = [];
    }
  }

  private generateEdges() {
    const targetEdges = this.config.numVertices * this.config.edgesPerVertex;
    const [minPrice, maxPrice] = this.config.priceRange;
    const [minLiq, maxLiq] = this.config.liquidityRange;

    while (this.edges.length < targetEdges) {
      const fromIdx = Math.floor(Math.random() * this.vertices.length);
      const toIdx = Math.floor(Math.random() * this.vertices.length);

      if (fromIdx === toIdx) continue;

      const from = this.vertices[fromIdx];
      const to = this.vertices[toIdx];

      // Check if edge already exists
      if (this.edges.some(e => e.source === from.key && e.target === to.key)) {
        continue;
      }

      const rate = minPrice + Math.random() * (maxPrice - minPrice);
      const liquidity = minLiq + Math.random() * (maxLiq - minLiq);
      
      const edge: SimulatedEdge = {
        source: from.key,
        target: to.key,
        rate,
        liquidity,
        kind: from.chain === to.chain ? 'swap' : 'bridge',
        weight: -Math.log(rate),
      };

      this.edges.push(edge);
    }
  }

  private buildGraph() {
    for (const edge of this.edges) {
      if (!this.graph[edge.source]) {
        this.graph[edge.source] = [];
      }
      this.graph[edge.source].push(edge);
    }
  }

  getGraph(): RouteGraph {
    return this.graph;
  }

  getVertices(): SimulatedVertex[] {
    return this.vertices;
  }

  getEdges(): SimulatedEdge[] {
    return this.edges;
  }

  getStats() {
    const edgesPerVertex = Object.values(this.graph).map(e => e.length);
    return {
      numVertices: this.vertices.length,
      numEdges: this.edges.length,
      avgEdgesPerVertex: this.edges.length / this.vertices.length,
      maxEdgesPerVertex: Math.max(...edgesPerVertex),
      minEdgesPerVertex: Math.min(...edgesPerVertex),
      crossChainEdges: this.edges.filter(e => e.kind === 'bridge').length,
      sameChainEdges: this.edges.filter(e => e.kind === 'swap').length,
    };
  }
}