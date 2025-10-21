// Blockscout API integration for transaction monitoring
export interface BlockscoutTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  status: '0' | '1'; // 0 = failed, 1 = success
  timestamp: string;
  blockNumber: string;
  method: string;
  isError: boolean;
}

export interface BlockscoutTokenTransfer {
  transactionHash: string;
  from: string;
  to: string;
  value: string;
  token: {
    address: string;
    symbol: string;
    name: string;
    decimals: string;
  };
}

export class BlockscoutAPI {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  // Get transaction details
  async getTransaction(txHash: string): Promise<BlockscoutTransaction> {
    const response = await fetch(`${this.baseUrl}/api/v2/transactions/${txHash}`, {
      headers: {
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
    });
    
    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.status}`);
    }
    
    return response.json();
  }

  // Get token transfers for a transaction
  async getTokenTransfers(txHash: string): Promise<BlockscoutTokenTransfer[]> {
    const response = await fetch(`${this.baseUrl}/api/v2/transactions/${txHash}/token-transfers`, {
      headers: {
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
    });
    
    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.status}`);
    }
    
    return response.json();
  }

  // Get account transactions
  async getAccountTransactions(address: string, limit = 50): Promise<BlockscoutTransaction[]> {
    const response = await fetch(`${this.baseUrl}/api/v2/addresses/${address}/transactions?limit=${limit}`, {
      headers: {
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
    });
    
    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.status}`);
    }
    
    return response.json();
  }

  // Get token balance for an address
  async getTokenBalance(address: string, tokenAddress: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/v2/tokens/${tokenAddress}/balances/${address}`, {
      headers: {
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
    });
    
    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.value || '0';
  }

  // Monitor transaction status
  async waitForTransaction(txHash: string, maxAttempts = 30, intervalMs = 2000): Promise<BlockscoutTransaction> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const tx = await this.getTransaction(txHash);
        if (tx.status === '1') {
          return tx;
        }
        if (tx.isError) {
          throw new Error(`Transaction failed: ${txHash}`);
        }
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw error;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Transaction timeout: ${txHash}`);
  }
}

// Pre-configured instances for different networks
export const blockscoutAPIs = {
  ethereum: new BlockscoutAPI('https://eth.blockscout.com'),
  sepolia: new BlockscoutAPI('https://sepolia.blockscout.com'),
  polygon: new BlockscoutAPI('https://polygon.blockscout.com'),
  mumbai: new BlockscoutAPI('https://mumbai.blockscout.com'),
  arbitrum: new BlockscoutAPI('https://arbitrum.blockscout.com'),
  arbitrumSepolia: new BlockscoutAPI('https://sepolia-rollup.arbitrum.blockscout.com'),
  avalanche: new BlockscoutAPI('https://avalanche.blockscout.com'),
  avalancheFuji: new BlockscoutAPI('https://avalanche-fuji.blockscout.com'),
};
