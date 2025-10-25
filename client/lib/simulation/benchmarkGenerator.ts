/**
 * Benchmark Generator - Creates a large graph from Blockscout tokens
 * Generates ~10^5 edges from real token data, saves to JSON for reuse
 */

import { RouteGraph, TokenKey, Edge, Vertex } from '../core/router';
import { fetchPythPriceFeed } from '../partners/pyth';
import { getAvailableTokens, PYTH_FEED_IDS } from '../partners/pyth-feed';
import fs from 'fs';
import path from 'path';

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
  };
}

const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche'];
const TARGET_EDGES = 100000;

/**
 * Generate benchmark data with real tokens from Pyth + synthetic edges
 */
export async function generateBenchmark(): Promise<BenchmarkData> {
  console.log('Starting benchmark generation...');
  const startTime = Date.now();
  
  const graph: RouteGraph = {};
  const vertices: Vertex[] = [];
  let edgeCount = 0;
  
  // Step 1: Get real tokens from Pyth
  console.log('Fetching real tokens from Pyth...');
  const realTokenSymbols = getAvailableTokens().filter(
    token => PYTH_FEED_IDS[`${token}/USD`]
  );
  
  // Add real tokens as vertices
  for (const symbol of realTokenSymbols) {
    const chain = SUPPORTED_CHAINS[0]; // Default to ethereum
    const key: TokenKey = `${symbol}.${chain}`;
    
    vertices.push({
      key,
      symbol,
      chain,
    });
    
    graph[key] = [];
  }
  
  console.log(`Added ${realTokenSymbols.length} real tokens`);
  
  // Step 2: Create edges between real tokens using actual price ratios
  console.log('Creating edges between real tokens...');
  for (let i = 0; i < realTokenSymbols.length && edgeCount < TARGET_EDGES / 2; i++) {
    for (let j = i + 1; j < realTokenSymbols.length && edgeCount < TARGET_EDGES / 2; j++) {
      try {
        const symbolA = realTokenSymbols[i];
        const symbolB = realTokenSymbols[j];
        
        const keyA = `${symbolA}.ethereum`;
        const keyB = `${symbolB}.ethereum`;
        
        const feedA = await fetchPythPriceFeed(PYTH_FEED_IDS[`${symbolA}/USD`], symbolA);
        const feedB = await fetchPythPriceFeed(PYTH_FEED_IDS[`${symbolB}/USD`], symbolB);
        
        if (feedA && feedB) {
          const rate = feedA.price / feedB.price;
          
          // Add bidirectional edges
          graph[keyA].push({
            target: keyB,
            kind: 'swap',
            rate,
            gas: 0.0003,
            dex: 'UniswapV3',
            poolAddress: `0x${symbolA}${symbolB}Pool`,
          });
          
          graph[keyB].push({
            target: keyA,
            kind: 'swap',
            rate: 1 / rate,
            gas: 0.0003,
            dex: 'UniswapV3',
            poolAddress: `0x${symbolB}${symbolA}Pool`,
          });
          
          edgeCount += 2;
        }
      } catch (error) {
        // Skip failed price fetches
      }
    }
  }
  
  console.log(`Created ${edgeCount} edges between real tokens`);
  
  // Step 3: Generate synthetic tokens and edges to reach target
  console.log(`Generating synthetic tokens to reach ${TARGET_EDGES} edges...`);
  let syntheticCount = 0;
  
  while (edgeCount < TARGET_EDGES) {
    const syntheticSymbol = `SYN${syntheticCount}`;
    const chain = SUPPORTED_CHAINS[Math.floor(Math.random() * SUPPORTED_CHAINS.length)];
    const key: TokenKey = `${syntheticSymbol}.${chain}`;
    
    vertices.push({
      key,
      symbol: syntheticSymbol,
      chain,
    });
    
    graph[key] = [];
    
    // Connect to random existing vertices
    const connectionsCount = Math.min(10, vertices.length - 1);
    const existingVertices = vertices.slice(0, -1); // All except the one we just added
    
    for (let i = 0; i < connectionsCount && edgeCount < TARGET_EDGES; i++) {
      const targetVertex = existingVertices[Math.floor(Math.random() * existingVertices.length)];
      const targetKey = targetVertex.key;
      
      // Skip if edge already exists
      if (graph[key].some(e => e.target === targetKey)) continue;
      
      const rate = 0.1 + Math.random() * 1.9; // Realistic exchange rate
      const isCrossChain = chain !== targetVertex.chain;
      
      // Add bidirectional edges
      graph[key].push({
        target: targetKey,
        kind: isCrossChain ? 'bridge' : 'swap',
        rate,
        gas: 0.0003,
        bridgeFee: isCrossChain ? 0.001 : undefined,
        dex: isCrossChain ? undefined : 'SyntheticDEX',
        poolAddress: isCrossChain ? undefined : `0x${syntheticSymbol}${targetVertex.symbol}`,
      });
      
      graph[targetKey].push({
        target: key,
        kind: isCrossChain ? 'bridge' : 'swap',
        rate: 1 / rate,
        gas: 0.0003,
        bridgeFee: isCrossChain ? 0.001 : undefined,
        dex: isCrossChain ? undefined : 'SyntheticDEX',
        poolAddress: isCrossChain ? undefined : `0x${targetVertex.symbol}${syntheticSymbol}`,
      });
      
      edgeCount += 2;
    }
    
    syntheticCount++;
    
    // Progress update every 100 tokens
    if (syntheticCount % 100 === 0) {
      console.log(`Generated ${syntheticCount} synthetic tokens, ${edgeCount} total edges`);
    }
  }
  
  const totalEdges = Object.values(graph).reduce((sum, edges) => sum + edges.length, 0);
  const elapsedMs = Date.now() - startTime;
  
  console.log(`\nBenchmark generation complete in ${elapsedMs}ms`);
  console.log(`Real tokens: ${realTokenSymbols.length}`);
  console.log(`Synthetic tokens: ${syntheticCount}`);
  console.log(`Total vertices: ${vertices.length}`);
  console.log(`Total edges: ${totalEdges}`);
  console.log(`Avg edges per vertex: ${(totalEdges / vertices.length).toFixed(2)}`);
  
  return {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    graph,
    vertices,
    stats: {
      realTokens: realTokenSymbols.length,
      syntheticTokens: syntheticCount,
      totalVertices: vertices.length,
      totalEdges,
      avgEdgesPerVertex: totalEdges / vertices.length,
    },
  };
}

/**
 * Save benchmark data to results folder
 */
export function saveBenchmark(data: BenchmarkData): string {
  const resultsDir = path.join(process.cwd(), 'results');
  
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const filename = `benchmark-${data.timestamp.replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(resultsDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  
  console.log(`Benchmark saved to: ${filepath}`);
  return filepath;
}

/**
 * Load the most recent benchmark data
 */
export function loadLatestBenchmark(): BenchmarkData | null {
  const resultsDir = path.join(process.cwd(), 'results');
  
  if (!fs.existsSync(resultsDir)) {
    return null;
  }
  
  const files = fs.readdirSync(resultsDir)
    .filter(f => f.startsWith('benchmark-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    return null;
  }
  
  const filepath = path.join(resultsDir, files[0]);
  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  
  console.log(`Loaded benchmark from: ${filepath}`);
  return data;
}
