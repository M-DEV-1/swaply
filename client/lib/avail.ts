// Avail blockchain integration
export interface AvailAccount {
  address: string;
  balance: string;
  nonce: number;
}

export interface AvailTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  nonce: number;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  timestamp?: number;
}

export interface AvailToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: string;
}

export class AvailAPI {
  private rpcUrl: string;
  private wsUrl?: string;

  constructor(rpcUrl: string = 'https://rpc.avail.tools', wsUrl?: string) {
    this.rpcUrl = rpcUrl;
    this.wsUrl = wsUrl;
  }

  // Get account information
  async getAccount(address: string): Promise<AvailAccount> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }),
    });

    const data = await response.json();
    const balance = data.result || '0x0';

    // Get nonce
    const nonceResponse = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionCount',
        params: [address, 'latest'],
        id: 2,
      }),
    });

    const nonceData = await nonceResponse.json();
    const nonce = parseInt(nonceData.result || '0x0', 16);

    return {
      address,
      balance: parseInt(balance, 16).toString(),
      nonce,
    };
  }

  // Get transaction by hash
  async getTransaction(txHash: string): Promise<AvailTransaction | null> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [txHash],
        id: 1,
      }),
    });

    const data = await response.json();
    if (!data.result) return null;

    const tx = data.result;
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      gas: tx.gas,
      gasPrice: tx.gasPrice,
      nonce: parseInt(tx.nonce, 16),
      status: 'confirmed',
      blockNumber: tx.blockNumber ? parseInt(tx.blockNumber, 16) : undefined,
    };
  }

  // Get transaction receipt
  async getTransactionReceipt(txHash: string): Promise<any> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: 1,
      }),
    });

    const data = await response.json();
    return data.result;
  }

  // Get latest block number
  async getLatestBlockNumber(): Promise<number> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    const data = await response.json();
    return parseInt(data.result, 16);
  }

  // Get gas price
  async getGasPrice(): Promise<string> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_gasPrice',
        params: [],
        id: 1,
      }),
    });

    const data = await response.json();
    return data.result;
  }

  // Estimate gas for a transaction
  async estimateGas(transaction: {
    from: string;
    to: string;
    value?: string;
    data?: string;
  }): Promise<string> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_estimateGas',
        params: [transaction],
        id: 1,
      }),
    });

    const data = await response.json();
    return data.result;
  }

  // Send raw transaction
  async sendRawTransaction(signedTx: string): Promise<string> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_sendRawTransaction',
        params: [signedTx],
        id: 1,
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`Transaction failed: ${data.error.message}`);
    }

    return data.result;
  }

  // Wait for transaction confirmation
  async waitForTransaction(txHash: string, maxAttempts = 30, intervalMs = 2000): Promise<AvailTransaction> {
    for (let i = 0; i < maxAttempts; i++) {
      const tx = await this.getTransaction(txHash);
      if (tx && tx.status === 'confirmed') {
        return tx;
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Transaction timeout: ${txHash}`);
  }

  // Get token information (for ERC-20 tokens on Avail)
  async getTokenInfo(tokenAddress: string): Promise<AvailToken> {
    // This would require calling ERC-20 contract methods
    // For now, return mock data
    return {
      address: tokenAddress,
      symbol: 'AVL',
      name: 'Avail Token',
      decimals: 18,
      totalSupply: '1000000000000000000000000', // 1M tokens
    };
  }
}

// Pre-configured Avail API instance
export const availAPI = new AvailAPI();

// Helper functions for common operations
export async function getAvailBalance(address: string): Promise<string> {
  const account = await availAPI.getAccount(address);
  return account.balance;
}

export async function getAvailGasPrice(): Promise<string> {
  return await availAPI.getGasPrice();
}

export async function estimateAvailGas(transaction: {
  from: string;
  to: string;
  value?: string;
  data?: string;
}): Promise<string> {
  return await availAPI.estimateGas(transaction);
}
