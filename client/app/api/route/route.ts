// /client/app/api/route/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildRouteGraph, findBestRoute, Vertex } from "@/lib/core/router";
import { getAvailableTokens } from "@/lib/partners/pyth-feed";

// Get supported assets from Pyth feeds
function getSupportedVertices(): Vertex[] {
  const availableTokens = getAvailableTokens();
  
  return availableTokens.map(symbol => ({
    key: `${symbol}.ethereum`, // Default to ethereum chain
    symbol: symbol,
    chain: "ethereum"
  }));
}

export async function POST(req: NextRequest) {
  try {
    const { source, target, hops } = await req.json();
    
    if (!source || !target) {
      return NextResponse.json({ error: "Missing source or target token" }, { status: 400 });
    }

    // Build graph dynamically from supported tokens
    const supportedVertices = getSupportedVertices();
    const graph = await buildRouteGraph(supportedVertices, hops || 4);

    // Compute best route
    const routeResult = await findBestRoute(graph, source, target, hops || 4);

    return NextResponse.json({
      success: true,
      route: routeResult.path,
      estimatedOutput: routeResult.estimatedOutput,
      steps: routeResult.steps,
      totalWeight: routeResult.totalWeight,
    });
  } catch (err: any) {
    console.error("Route API error:", err);
    return NextResponse.json({ error: err.message || "Routing failed" }, { status: 500 });
  }
}
