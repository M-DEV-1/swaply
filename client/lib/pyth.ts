// Pyth API integration for real-time price feeds
export interface PythPrice {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

export interface PythPriceUpdate {
  price_feed: {
    id: string;
    price: {
      price: string;
      conf: string;
      expo: number;
      publish_time: number;
    };
  };
}

export class PythAPI {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string = 'https://hermes.pyth.network', apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  // Get latest price for a price feed
  async getLatestPrice(priceId: string): Promise<PythPrice> {
    const response = await fetch(`${this.baseUrl}/v2/updates/price/latest?ids[]=${priceId}`, {
      headers: {
        'Accept': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
    });
    
    if (!response.ok) {
      throw new Error(`Pyth API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.parsed[0];
  }

  // Get latest prices for multiple feeds
  async getLatestPrices(priceIds: string[]): Promise<PythPrice[]> {
    const ids = priceIds.map(id => `ids[]=${id}`).join('&');
    const response = await fetch(`${this.baseUrl}/v2/updates/price/latest?${ids}`, {
      headers: {
        'Accept': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
    });
    
    if (!response.ok) {
      throw new Error(`Pyth API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.parsed;
  }

  // Get historical price data
  async getHistoricalPrice(priceId: string, startTime: number, endTime: number): Promise<PythPrice[]> {
    const response = await fetch(
      `${this.baseUrl}/v2/updates/price/range?ids[]=${priceId}&start_time=${startTime}&end_time=${endTime}`,
      {
        headers: {
          'Accept': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Pyth API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.parsed;
  }

  // Convert price to USD value
  convertPriceToUSD(price: PythPrice, amount: number): number {
    const priceValue = parseFloat(price.price.price);
    const expo = price.price.expo;
    const adjustedPrice = priceValue * Math.pow(10, expo);
    return amount * adjustedPrice;
  }

  // Get price confidence (slippage estimation)
  getPriceConfidence(price: PythPrice): number {
    const confValue = parseFloat(price.price.conf);
    const expo = price.price.expo;
    return confValue * Math.pow(10, expo);
  }
}

// Common price feed IDs for major tokens
export const PYTH_PRICE_IDS = {
  // Ethereum ecosystem
  ETH_USD: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  USDC_USD: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  USDT_USD: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
  DAI_USD: '0xb0948a5e5313200c632b51bb5ca32f6e0d36e6550d1aa9a6f6e0d6e3f4a5e5e5',
  WBTC_USD: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  
  // Polygon ecosystem
  MATIC_USD: '0x5de33a9112c2b690b8b76c8a0faa3f2da963a12d5c3372c97f5adb4d457e67c',
  
  // Avalanche ecosystem
  AVAX_USD: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb',
  
  // Arbitrum ecosystem
  ARB_USD: '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
} as const;

// Pre-configured Pyth API instance
export const pythAPI = new PythAPI();

// Helper function to get token price
export async function getTokenPrice(symbol: string): Promise<number> {
  const priceId = PYTH_PRICE_IDS[symbol as keyof typeof PYTH_PRICE_IDS];
  if (!priceId) {
    throw new Error(`Price feed not found for ${symbol}`);
  }
  
  const price = await pythAPI.getLatestPrice(priceId);
  return pythAPI.convertPriceToUSD(price, 1);
}

// Helper function to get multiple token prices
export async function getTokenPrices(symbols: string[]): Promise<Record<string, number>> {
  const priceIds = symbols.map(symbol => PYTH_PRICE_IDS[symbol as keyof typeof PYTH_PRICE_IDS]).filter(Boolean);
  const prices = await pythAPI.getLatestPrices(priceIds);
  
  const result: Record<string, number> = {};
  symbols.forEach((symbol, index) => {
    if (prices[index]) {
      result[symbol] = pythAPI.convertPriceToUSD(prices[index], 1);
    }
  });
  
  return result;
}
