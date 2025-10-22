// Transaction monitoring service integrating Blockscout, Pyth, and Avail
import { BlockscoutAPI, blockscoutAPIs } from './partners/blockscout';
import { pythAPI, getTokenPrice } from './partners/pyth';
import { availAPI } from './partners/avail';
import { getTestnetConfig } from './testnet/testnet-config';

export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
  gasPrice?: string;
  timestamp?: number;
  from: string;
  to: string;
  value: string;
  tokenTransfers?: Array<{
    token: string;
    symbol: string;
    from: string;
    to: string;
    value: string;
    decimals: number;
  }>;
  priceImpact?: {
    token: string;
    priceBefore: number;
    priceAfter: number;
    impact: number;
  };
}

export interface SwapRoute {
  from: {
    token: string;
    chain: string;
    amount: number;
  };
  to: {
    token: string;
    chain: string;
    amount: number;
  };
  hops: Array<{
    from: string;
    to: string;
    type: 'swap' | 'bridge';
    dex?: string;
    bridge?: string;
    expectedOut: number;
    feesUSD: number;
    confidence: number;
  }>;
  totalExpectedOut: number;
  totalGasUSD: number;
  worstCaseOut: number;
}

export class TransactionMonitor {
  private blockscoutAPI: BlockscoutAPI;
  private chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.blockscoutAPI = this.getBlockscoutAPI(chainId);
  }

  private getBlockscoutAPI(chainId: number): BlockscoutAPI {
    const config = getTestnetConfig(chainId);
    if (!config?.blockscoutUrl) {
      throw new Error(`Blockscout not available for chain ${chainId}`);
    }
    
    return new BlockscoutAPI(config.blockscoutUrl);
  }

  // Monitor a transaction with real-time updates
  async monitorTransaction(
    txHash: string,
    onUpdate: (status: TransactionStatus) => void,
    onComplete: (status: TransactionStatus) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      // Start monitoring
      const interval = setInterval(async () => {
        try {
          const status = await this.getTransactionStatus(txHash);
          onUpdate(status);
          
          if (status.status === 'confirmed' || status.status === 'failed') {
            clearInterval(interval);
            onComplete(status);
          }
        } catch (error) {
          clearInterval(interval);
          onError(error as Error);
        }
      }, 2000); // Check every 2 seconds

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(interval);
        onError(new Error('Transaction monitoring timeout'));
      }, 300000);
    } catch (error) {
      onError(error as Error);
    }
  }

  // Get comprehensive transaction status
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    try {
      // Get transaction details from Blockscout
      const tx = await this.blockscoutAPI.getTransaction(txHash);
      const tokenTransfers = await this.blockscoutAPI.getTokenTransfers(txHash);

      // Get price impact data from Pyth
      const priceImpact = await this.getPriceImpact(tokenTransfers);

      return {
        hash: tx.hash,
        status: tx.status === '1' ? 'confirmed' : tx.isError ? 'failed' : 'pending',
        blockNumber: parseInt(tx.blockNumber),
        gasUsed: tx.gasUsed,
        gasPrice: tx.gasPrice,
        timestamp: parseInt(tx.timestamp) * 1000,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        tokenTransfers: tokenTransfers.map(transfer => ({
          token: transfer.token.address,
          symbol: transfer.token.symbol,
          from: transfer.from,
          to: transfer.to,
          value: transfer.value,
          decimals: parseInt(transfer.token.decimals),
        })),
        priceImpact,
      };
    } catch (error) {
      throw new Error(`Failed to get transaction status: ${error}`);
    }
  }

  // Get price impact for token transfers
  private async getPriceImpact(tokenTransfers: any[]): Promise<TransactionStatus['priceImpact']> {
    if (tokenTransfers.length === 0) return undefined;

    try {
      const transfer = tokenTransfers[0];
      const symbol = transfer.token.symbol;
      
      // Get current price from Pyth
      const currentPrice = await getTokenPrice(symbol);
      
      // For demo purposes, simulate price impact
      const priceBefore = currentPrice * 0.98; // 2% lower
      const priceAfter = currentPrice;
      const impact = ((priceAfter - priceBefore) / priceBefore) * 100;

      return {
        token: symbol,
        priceBefore,
        priceAfter,
        impact,
      };
    } catch (error) {
      console.warn('Failed to get price impact:', error);
      return undefined;
    }
  }

  // Get account balance with real-time price conversion
  async getAccountBalance(address: string, tokenAddress?: string): Promise<{
    balance: string;
    balanceUSD: number;
    token: {
      symbol: string;
      name: string;
      decimals: number;
    };
  }> {
    try {
      let balance: string;
      let token: any;

      if (tokenAddress) {
        // Get ERC-20 token balance
        balance = await this.blockscoutAPI.getTokenBalance(address, tokenAddress);
        // In a real implementation, you'd get token info from the contract
        token = {
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        };
      } else {
        // Get native token balance
        const account = await availAPI.getAccount(address);
        balance = account.balance;
        token = {
          symbol: 'AVL',
          name: 'Avail Token',
          decimals: 18,
        };
      }

      // Convert to USD using Pyth price feed
      const balanceNumber = parseFloat(balance) / Math.pow(10, token.decimals);
      const priceUSD = await getTokenPrice(token.symbol);
      const balanceUSD = balanceNumber * priceUSD;

      return {
        balance,
        balanceUSD,
        token,
      };
    } catch (error) {
      throw new Error(`Failed to get account balance: ${error}`);
    }
  }

  // Get gas price with real-time updates
  async getGasPrice(): Promise<{
    gasPrice: string;
    gasPriceUSD: number;
  }> {
    try {
      const gasPrice = await availAPI.getGasPrice();
      const gasPriceNumber = parseInt(gasPrice, 16);
      const gasPriceGwei = gasPriceNumber / 1e9;
      
      // Get ETH price for USD conversion
      const ethPrice = await getTokenPrice('ETH');
      const gasPriceUSD = (gasPriceGwei / 1e9) * ethPrice;

      return {
        gasPrice,
        gasPriceUSD,
      };
    } catch (error) {
      throw new Error(`Failed to get gas price: ${error}`);
    }
  }

  // Estimate transaction cost
  async estimateTransactionCost(transaction: {
    from: string;
    to: string;
    value?: string;
    data?: string;
  }): Promise<{
    gasLimit: string;
    gasPrice: string;
    totalCost: string;
    totalCostUSD: number;
  }> {
    try {
      const gasLimit = await availAPI.estimateGas(transaction);
      const { gasPrice, gasPriceUSD } = await this.getGasPrice();
      
      const gasLimitNumber = parseInt(gasLimit, 16);
      const gasPriceNumber = parseInt(gasPrice, 16);
      const totalCost = (gasLimitNumber * gasPriceNumber).toString();
      const totalCostUSD = (gasLimitNumber * gasPriceNumber / 1e18) * (gasPriceUSD / (parseInt(gasPrice, 16) / 1e18));

      return {
        gasLimit,
        gasPrice,
        totalCost,
        totalCostUSD,
      };
    } catch (error) {
      throw new Error(`Failed to estimate transaction cost: ${error}`);
    }
  }

  // Get transaction history with price data
  async getTransactionHistory(address: string, limit = 50): Promise<TransactionStatus[]> {
    try {
      const transactions = await this.blockscoutAPI.getAccountTransactions(address, limit);
      
      const statuses: TransactionStatus[] = [];
      
      for (const tx of transactions) {
        const tokenTransfers = await this.blockscoutAPI.getTokenTransfers(tx.hash);
        const priceImpact = await this.getPriceImpact(tokenTransfers);
        
        statuses.push({
          hash: tx.hash,
          status: tx.status === '1' ? 'confirmed' : tx.isError ? 'failed' : 'pending',
          blockNumber: parseInt(tx.blockNumber),
          gasUsed: tx.gasUsed,
          gasPrice: tx.gasPrice,
          timestamp: parseInt(tx.timestamp) * 1000,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          tokenTransfers: tokenTransfers.map(transfer => ({
            token: transfer.token.address,
            symbol: transfer.token.symbol,
            from: transfer.from,
            to: transfer.to,
            value: transfer.value,
            decimals: parseInt(transfer.token.decimals),
          })),
          priceImpact,
        });
      }
      
      return statuses;
    } catch (error) {
      throw new Error(`Failed to get transaction history: ${error}`);
    }
  }
}

// Create transaction monitor instance
export function createTransactionMonitor(chainId: number): TransactionMonitor {
  return new TransactionMonitor(chainId);
}
