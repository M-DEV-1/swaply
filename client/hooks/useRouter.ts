// src/hooks/useRouter.ts
"use client";

import { useState } from 'react';
import axios from 'axios';
import { Route } from '@/lib/types/route';

export function useRouter() {
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string| null>(null);

  async function computeRoute(payload: { from: any; to: any; amount: number; constraints?: any }) {
    setLoading(true); 
    setError(null);
    setRoute(null); // Clear previous route
    
    try {
      // Transform payload to match API expectations
      const apiPayload = {
        source: `${payload.from.token}.${payload.from.chain}`,
        target: `${payload.to.token}.${payload.to.chain}`,
        hops: 4
      };
      
      const res = await axios.post('/api/route', apiPayload);
      
      // Check if API returned an error
      if (!res.data.success) {
        throw new Error(res.data.error || 'Route computation failed');
      }
      
      // Transform API response to match Route type
      const routeData = res.data;
      const transformedRoute: Route = {
        id: `route-${Date.now()}`,
        input: {
          token: payload.from.token,
          chain: payload.from.chain,
          amount: payload.amount
        },
        outputToken: {
          token: payload.to.token,
          chain: payload.to.chain
        },
        hops: routeData.steps?.map((step: any, index: number) => ({
          from: { token: step.from.split('.')[0], chain: step.from.split('.')[1] },
          to: { token: step.to.split('.')[0], chain: step.to.split('.')[1] },
          type: step.kind as 'swap' | 'bridge',
          expectedOut: payload.amount * routeData.estimatedOutput,
          feesUSD: 0.5, // placeholder
          liquidityDepth: 1000000, // placeholder
          confidence: 0.95, // placeholder
          meta: step.details
        })) || [],
        totalExpectedOut: payload.amount * routeData.estimatedOutput,
        totalGasUSD: 5.0, // placeholder
        worstCaseOut: payload.amount * routeData.estimatedOutput * 0.95,
        computedAt: new Date().toISOString()
      };
      
      setRoute(transformedRoute);
      return transformedRoute;
    } catch (e: any) {
      const errorMessage = e?.response?.data?.error || e?.message || 'Route computation failed';
      setError(errorMessage);
      console.error('Route computation error:', errorMessage);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { route, loading, error, computeRoute, setRoute };
}
