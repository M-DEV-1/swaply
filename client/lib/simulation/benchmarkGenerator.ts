// client/lib/simulation/benchmarkGenerator.ts
import { RouteGraph, TokenKey, Edge, Vertex } from '../core/router';
import { fetchPythPriceFeed } from '../partners/pyth';
import { getAvailableTokens, PYTH_FEED_IDS } from '../partners/pyth-feed';

export interface BenchmarkData {
  timestamp: string;
  version: string;
  graph: RouteGraph;
  vertices: Vertex[];
  stats: {
    realTokens: number;
    syntheticTokens: number;
    totalVertices: number;
    totalEdges: number;
    avgEdgesPerVertex: number;
    maxEdgesPerVertex: number;
    minEdgesPerVertex: number;
  };
}

const TARGET_EDGES = 100000;
const MAX_AVG_DEGREE = 5;
const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche'];

/**
 * Generate sparse benchmark graph with exactly 10^5 edges
 * and average degree ≤ 5 edges/vertex
 */
export async function generateBenchmark(): Promise<BenchmarkData> {
  console.log('Starting benchmark generation...');
  console.log(`Target: ${TARGET_EDGES} edges, max avg degree: ${MAX_AVG_DEGREE}`);
  
  const startTime = Date.now();
  const graph: RouteGraph = {};
  const vertices: Vertex[] = [];
  
  // Step 1: Calculate required number of vertices
  const minVertices = Math.ceil(TARGET_EDGES / MAX_AVG_DEGREE);
  console.log(`Calculated min vertices needed: ${minVertices}`);
  
  // Step 2: Get real tokens from Pyth (with caching)
  console.log('Fetching real tokens from Pyth...');
  const realTokenSymbols = getAvailableTokens();
  const realTokenCount = Math.min(realTokenSymbols.length, 50); // Limit to avoid API spam
  const selectedRealTokens = realTokenSymbols.slice(0, realTokenCount);
  
  console.log(`Using ${selectedRealTokens.length} real tokens from Pyth`);
  
  // Step 3: Fetch prices for real tokens (BATCHED to avoid rate limits)
  const priceCache = await fetchPricesBatched(selectedRealTokens);
  
  // Step 4: Add real tokens as vertices
  for (const symbol of selectedRealTokens) {
    const chain = SUPPORTED_CHAINS[Math.floor(Math.random() * SUPPORTED_CHAINS.length)];
    const key: TokenKey = `${symbol}.${chain}`;
    
    vertices.push({ key, symbol, chain });
    graph[key] = [];
  }
  
  // Step 5: Calculate how many synthetic tokens needed
  const syntheticCount = Math.max(0, minVertices - realTokenCount);
  console.log(`Generating ${syntheticCount} synthetic tokens...`);
  
  // Step 6: Generate synthetic tokens
  for (let i = 0; i < syntheticCount; i++) {
    const symbol = `SYN${i}`;
    const chain = SUPPORTED_CHAINS[Math.floor(Math.random() * SUPPORTED_CHAINS.length)];
    const key: TokenKey = `${symbol}.${chain}`;
    
    vertices.push({ key, symbol, chain });
    graph[key] = [];
    
    if ((i + 1) % 1000 === 0) {
      console.log(`Generated ${i + 1}/${syntheticCount} synthetic tokens`);
    }
  }
  
  console.log(`Total vertices: ${vertices.length}`);
  
  // Step 7: Generate edges using SPARSE strategy
  console.log('Generating sparse edges...');
  const edgeCount = generateSparseEdges(
    graph,
    vertices,
    priceCache,
    TARGET_EDGES,
    MAX_AVG_DEGREE
  );
  
  // Step 8: Verify graph properties
  const stats = calculateGraphStats(graph, vertices, realTokenCount);
  
  const elapsedMs = Date.now() - startTime;
  console.log('\n=== Benchmark Generation Complete ===');
  console.log(`Time: ${(elapsedMs / 1000).toFixed(2)}s`);
  console.log(`Real tokens: ${stats.realTokens}`);
  console.log(`Synthetic tokens: ${stats.syntheticTokens}`);
  console.log(`Total vertices: ${stats.totalVertices}`);
  console.log(`Total edges: ${stats.totalEdges}`);
  console.log(`Avg edges/vertex: ${stats.avgEdgesPerVertex.toFixed(2)}`);
  console.log(`Max edges/vertex: ${stats.maxEdgesPerVertex}`);
  console.log(`Min edges/vertex: ${stats.minEdgesPerVertex}`);
  
  // Verify constraints
  if (stats.avgEdgesPerVertex > MAX_AVG_DEGREE) {
    console.warn(`⚠️  Average degree ${stats.avgEdgesPerVertex} exceeds limit ${MAX_AVG_DEGREE}`);
  }
  if (stats.totalEdges < TARGET_EDGES * 0.95 || stats.totalEdges > TARGET_EDGES * 1.05) {
    console.warn(`⚠️  Edge count ${stats.totalEdges} is outside target range`);
  }
  
  return {
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    graph,
    vertices,
    stats,
  };
}

/**
 * Fetch Pyth prices in batches to avoid rate limits
 */
async function fetchPricesBatched(
  symbols: string[],
  batchSize: number = 10
): Promise<Map<string, number>> {
  const priceCache = new Map<string, number>();
  
  console.log(`Fetching ${symbols.length} prices in batches of ${batchSize}...`);
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, Math.min(i + batchSize, symbols.length));
    
    // Fetch batch concurrently
    const promises = batch.map(async (symbol) => {
      try {
        const feedKey = symbol === 'MATIC' ? 'MATICX/MATIC.RR' : 
                        symbol === 'BTC' ? 'BTC/USD' : 
                        `${symbol}/USD`;
        
        const feedId = PYTH_FEED_IDS[feedKey];
        if (!feedId) return null;
        
        const price = await fetchPythPriceFeed(feedId, symbol);
        if (price && price.price > 0) {
          priceCache.set(symbol, price.price);
        }
        return price;
      } catch (error) {
        console.warn(`Failed to fetch price for ${symbol}:`, error);
        return null;
      }
    });
    
    await Promise.all(promises);
    
    // Rate limiting: wait between batches
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
    }
  }
  
  console.log(`Cached ${priceCache.size} prices`);
  return priceCache;
}

/**
 * Generate sparse edges ensuring avg degree ≤ maxAvgDegree
 * Uses random sparse graph generation (Erdős-Rényi with degree constraint)
 */
function generateSparseEdges(
  graph: RouteGraph,
  vertices: Vertex[],
  priceCache: Map<string, number>,
  targetEdges: number,
  maxAvgDegree: number
): number {
  const n = vertices.length;
  const maxEdgesPerVertex = Math.ceil(maxAvgDegree * 1.5); // Allow some variance
  const edgeCounts: Record<TokenKey, number> = {};
  
  // Initialize edge counts
  for (const v of vertices) {
    edgeCounts[v.key] = 0;
  }
  
  let totalEdges = 0;
  const maxAttempts = targetEdges * 3; // Avoid infinite loops
  let attempts = 0;
  
  while (totalEdges < targetEdges && attempts < maxAttempts) {
    attempts++;
    
    // Randomly select source and target
    const fromIdx = Math.floor(Math.random() * n);
    const toIdx = Math.floor(Math.random() * n);
    
    if (fromIdx === toIdx) continue;
    
    const from = vertices[fromIdx];
    const to = vertices[toIdx];
    
    // Check degree constraints
    if (edgeCounts[from.key] >= maxEdgesPerVertex) continue;
    if (edgeCounts[to.key] >= maxEdgesPerVertex) continue;
    
    // Check if edge already exists
    if (graph[from.key].some(e => e.target === to.key)) continue;
    
    // Determine edge type
    const isCrossChain = from.chain !== to.chain;
    
    // Calculate rate
    let rate: number;
    const fromPrice = priceCache.get(from.symbol);
    const toPrice = priceCache.get(to.symbol);
    
    if (fromPrice && toPrice && fromPrice > 0 && toPrice > 0) {
      // Use real price ratio
      rate = fromPrice / toPrice;
    } else {
      // Generate realistic synthetic rate
      rate = 0.1 + Math.random() * 1.9; // Between 0.1 and 2.0
    }
    
    // Add edge
    const edge: Edge = {
      target: to.key,
      kind: isCrossChain ? 'bridge' : 'swap',
      rate,
      gas: 0.0001 + Math.random() * 0.0005,
      bridgeFee: isCrossChain ? 0.001 : undefined,
      dex: isCrossChain ? undefined : 'UniswapV3',
      poolAddress: isCrossChain ? undefined : `0x${from.symbol}${to.symbol}Pool`,
    };
    
    graph[from.key].push(edge);
    edgeCounts[from.key]++;
    edgeCounts[to.key]++; // Count incoming edge for degree balance
    totalEdges++;
    
    // Progress update
    if (totalEdges % 10000 === 0) {
      const avgDegree = (totalEdges / n).toFixed(2);
      console.log(`  Edges: ${totalEdges}/${targetEdges} (avg degree: ${avgDegree})`);
    }
  }
  
  if (attempts >= maxAttempts) {
    console.warn(`Stopped after ${attempts} attempts with ${totalEdges} edges`);
  }
  
  return totalEdges;
}

/**
 * Calculate graph statistics
 */
function calculateGraphStats(
  graph: RouteGraph,
  vertices: Vertex[],
  realTokenCount: number
): BenchmarkData['stats'] {
  const edgeCounts = Object.values(graph).map(edges => edges.length);
  const totalEdges = edgeCounts.reduce((sum, count) => sum + count, 0);
  
  return {
    realTokens: realTokenCount,
    syntheticTokens: vertices.length - realTokenCount,
    totalVertices: vertices.length,
    totalEdges,
    avgEdgesPerVertex: totalEdges / vertices.length,
    maxEdgesPerVertex: Math.max(...edgeCounts, 0),
    minEdgesPerVertex: Math.min(...edgeCounts, 0),
  };
}

/**
 * Save benchmark to file
 */
export function saveBenchmark(data: BenchmarkData): string {
  const fs = require('fs');
  const path = require('path');
  
  const resultsDir = path.join(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const filename = `benchmark-${data.timestamp.replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(resultsDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  
  console.log(`\n✅ Benchmark saved to: ${filepath}`);
  return filepath;
}

/**
 * Load latest benchmark
 */
export function loadLatestBenchmark(): BenchmarkData | null {
  const fs = require('fs');
  const path = require('path');
  
  const resultsDir = path.join(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) {
    return null;
  }
  
  const files = fs.readdirSync(resultsDir)
    .filter((f: string) => f.startsWith('benchmark-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    return null;
  }
  
  const filepath = path.join(resultsDir, files[0]);
  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  
  console.log(`Loaded benchmark: ${filepath}`);
  console.log(`  Vertices: ${data.stats.totalVertices}`);
  console.log(`  Edges: ${data.stats.totalEdges}`);
  console.log(`  Avg degree: ${data.stats.avgEdgesPerVertex.toFixed(2)}`);
  
  return data;
}