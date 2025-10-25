export type Chain = 'ethereum' | 'polygon' | 'avail' | string;

export interface Token {
  token: string;
  chain: Chain;
  symbol?: string;
  name?: string;
  decimals?: number;
}

export interface Node {
  token: string; 
  chain: Chain;
}

export interface RouteHop {
  from: Node;
  to: Node;
  type: 'swap' | 'bridge';
  expectedOut: number;
  feesUSD: number;
  liquidityDepth: number;
  confidence: number; // 0..1
  meta?: Record<string, any>;
}

export interface Route {
  id: string;
  input: { token: string; chain: Chain; amount: number };
  outputToken: { token: string; chain: Chain };
  hops: RouteHop[];
  totalExpectedOut: number;
  totalGasUSD: number;
  worstCaseOut: number;
  computedAt: string;
}

// Algorithm-specific route types
export interface DijkstraMetrics {
  executionTimeMs: number;
  gasEstimate: number;
  visitedNodes: number;
  pathLength: number;
}

export interface PSBDijkstraMetrics extends DijkstraMetrics {
  barrierCount: number;
}

export interface AlgorithmResult {
  route: Route;
  metrics: DijkstraMetrics | PSBDijkstraMetrics;
}

export interface RouteComparison {
  timestamp: string;
  sourceToken: string;
  targetToken: string;
  amount: string;
  classic: AlgorithmResult;
  psb: AlgorithmResult;
}
