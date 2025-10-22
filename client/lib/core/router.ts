/*
  BetterETH Router — Cross-Chain DEX Swap Routing Engine
  ------------------------------------------------------
  Core routing module built in TypeScript for the Next.js app.
  Implements a Dijkstra-based weighted pathfinder to determine optimal
  swap and bridge routes across multiple blockchains.
  Designed to integrate with:
    - Pyth Network (price oracles)
    - Blockscout (on-chain data fetching)
    - Avail (cross-chain data availability)
*/

export type TokenID = string; // Example: "USDC_polygon" or "ETH_ethereum"

export interface Edge {
  target: TokenID;
  weight: number; // Pathfinding cost (-ln(exchangeRate) + penalties)
  gasCost?: number; // Optional gas data in USD terms
  timeCost?: number; // Optional latency in seconds
  description?: string; // Optional label e.g., "UniswapSwap" or "Bridge via Avail"
}

export interface Graph {
  [token: TokenID]: Edge[];
}

export interface RouteResult {
  path: TokenID[];
  totalWeight: number;
  estimatedOutput: number;
  totalGas: number;
  totalTime: number;
  breakdown: {
    [key: string]: { weight: number; gas: number; time: number };
  };
}

/* ---------- Utility: buildGraph ----------
   Creates a token graph for testing.
   Replace with dynamic data from Blockscout + Pyth later.
*/
export function buildMockGraph(): Graph {
  const graph: Graph = {
    "ABC_polygon": [
      {
        target: "USDC_polygon",
        weight: -Math.log(1.994), // ABC→USDC swap
        gasCost: 5,
        description: "Uniswap ABC→USDC swap (Polygon)",
      },
    ],
    "USDC_polygon": [
      {
        target: "USDC_ethereum",
        weight: -Math.log(0.998), // Bridge via Avail
        gasCost: 20,
        timeCost: 120,
        description: "Bridge USDC via Avail (Polygon→Ethereum)",
      },
    ],
    "USDC_ethereum": [
      {
        target: "XYZ_ethereum",
        weight: -Math.log(0.00997), // USDC→XYZ swap
        gasCost: 10,
        description: "Uniswap USDC→XYZ swap (Ethereum)",
      },
    ],
  };

  return graph;
}

/* ---------- Core Logic: findBestRoute ----------
   Implements Dijkstra’s Algorithm for minimum total cost.
   Lower cumulative weight = higher output.
*/
export function findBestRoute(
  graph: Graph,
  source: TokenID,
  target: TokenID
): RouteResult {
  const dist: Record<TokenID, number> = {};
  const prev: Record<TokenID, TokenID | null> = {};
  const pq: [TokenID, number][] = [];

  for (const token in graph) {
    dist[token] = Infinity;
    prev[token] = null;
  }

  dist[source] = 0;
  pq.push([source, 0]);

  const popMin = (): [TokenID, number] | undefined => {
    if (pq.length === 0) return undefined;
    let minIndex = 0;
    for (let i = 1; i < pq.length; i++) {
      if (pq[i][1] < pq[minIndex][1]) minIndex = i;
    }
    return pq.splice(minIndex, 1)[0];
  };

  while (pq.length > 0) {
    const current = popMin();
    if (!current) break;

    const [token, weight] = current;
    if (token === target) break;

    for (const edge of graph[token] || []) {
      const newWeight = weight + edge.weight;
      if (newWeight < dist[edge.target]) {
        dist[edge.target] = newWeight;
        prev[edge.target] = token;
        pq.push([edge.target, newWeight]);
      }
    }
  }

  if (dist[target] === Infinity) {
    throw new Error(`No route found from ${source} to ${target}`);
  }

  const path: TokenID[] = [];
  let cur: TokenID | null = target;
  while (cur) {
    path.unshift(cur);
    cur = prev[cur];
  }

  // Aggregate metrics
  let totalGas = 0;
  let totalTime = 0;
  const breakdown: Record<string, { weight: number; gas: number; time: number }> = {};

  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    const edge = (graph[from] || []).find((e) => e.target === to);
    if (edge) {
      totalGas += edge.gasCost || 0;
      totalTime += edge.timeCost || 0;
      breakdown[`${from}->${to}`] = {
        weight: edge.weight,
        gas: edge.gasCost || 0,
        time: edge.timeCost || 0,
      };
    }
  }

  // Estimate output as exp(-totalWeight)
  const estimatedOutput = Math.exp(-dist[target]);

  return {
    path,
    totalWeight: dist[target],
    estimatedOutput,
    totalGas,
    totalTime,
    breakdown,
  };
}

/* ---------- Demo Runner ----------
   For local testing in Node.js or Next.js API route.
*/

export function demoRun() {
  const graph = buildMockGraph();
  const result = findBestRoute(graph, "ABC_polygon", "XYZ_ethereum");
  console.log("Best Route Path:", result.path.join(" → "));
  console.log("Estimated Output:", result.estimatedOutput.toFixed(4));
  console.log("Gas (USD):", result.totalGas, "| Time (s):", result.totalTime);
  console.log("Route Breakdown:", result.breakdown);
  return result;
}

/*
  Example Usage in Next.js API route:

  import { demoRun } from '@/client/lib/core/router';

  export async function POST(req: Request) {
    const { from, to } = await req.json();
    const result = demoRun(); // Replace with findBestRoute(graph, from, to)
    return NextResponse.json(result);
  }
*/

/*
  Extension Plan
  ------------------------------------------------------------------
  1. Replace buildMockGraph() with dynamic data:
     - Use Blockscout's API to fetch DEX pool rates per token pair.
     - Use Pyth oracle for token price normalization.
     - Use Avail API to annotate cross-chain bridge latency and reliability.
  2. Add simulation loop to detect price changes (via Pyth) and rerun routing.
  3. Export metrics for visualization in Next.js frontend dashboard.
*/
