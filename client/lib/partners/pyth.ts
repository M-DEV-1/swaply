/*
  Pyth Integration Module
  Purpose:
  - Fetch asset prices for routing weight calculations.
  - Normalize on-chain rates against oracle data.
*/

const PYTH_BASE = process.env.NEXT_PUBLIC_PYTH_API || "https://hermes.pyth.network/v2/updates/price/latest";

export interface PythPrice {
  symbol: string;
  price: number;
  confidence: number;
  timestamp: number;
}

export async function getPythPrice(symbol: string): Promise<PythPrice | null> {
  try {
    const res = await fetch(`${PYTH_BASE}?ids[]=${symbol}`);
    const json = await res.json();
    const priceData = json.parsed[0];
    return {
      symbol,
      price: priceData.price.price / 1e8, // Pyth returns scaled integers
      confidence: priceData.price.conf,
      timestamp: priceData.timestamp,
    };
  } catch {
    return null;
  }
}

export async function getTokenPairRate(baseToken: string, quoteToken: string): Promise<number> {
  const base = await getPythPrice(baseToken);
  const quote = await getPythPrice(quoteToken);
  if (base && quote && quote.price > 0) return base.price / quote.price;
  return 1; // fallback to neutral rate if oracle unavailable
}
