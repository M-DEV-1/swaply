"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronDown } from 'lucide-react';
import { getAvailableTokens, getTokenInfo } from '@/lib/partners/pyth-feed';

interface Token {
  token: string;
  chain: string;
  symbol: string;
  name: string;
  address?: string;
  decimals: number;
  logoUrl?: string;
}

interface TokenSelectorProps {
  tokens: string[];
  value?: string;
  onChange: (token: string) => void;
  placeholder?: string;
}

// Get tokens from Pyth feeds - only show tokens that have price feeds
function getPythTokens(): Token[] {
  const availableTokens = getAvailableTokens();
  
  return availableTokens.map(symbol => {
    const tokenInfo = getTokenInfo(symbol);
    if (!tokenInfo) return null;
    
    // Map symbols to their common names and chains
    const tokenMap: Record<string, { name: string; chain: string; decimals: number }> = {
      'ETH': { name: 'Ethereum', chain: 'ethereum', decimals: 18 },
      'BTC': { name: 'Bitcoin', chain: 'ethereum', decimals: 8 },
      'USDC': { name: 'USD Coin', chain: 'ethereum', decimals: 6 },
      'USDT': { name: 'Tether USD', chain: 'ethereum', decimals: 6 },
      'MATIC': { name: 'Polygon', chain: 'polygon', decimals: 18 },
      'BNB': { name: 'Binance Coin', chain: 'bsc', decimals: 18 },
      'SOL': { name: 'Solana', chain: 'solana', decimals: 9 },
      'ARB': { name: 'Arbitrum', chain: 'arbitrum', decimals: 18 },
      'AVAX': { name: 'Avalanche', chain: 'avalanche', decimals: 18 },
      'AAVE': { name: 'Aave', chain: 'ethereum', decimals: 18 },
      'UNI': { name: 'Uniswap', chain: 'ethereum', decimals: 18 },
      'LINK': { name: 'Chainlink', chain: 'ethereum', decimals: 18 },
      'LTC': { name: 'Litecoin', chain: 'ethereum', decimals: 8 },
      'DOGE': { name: 'Dogecoin', chain: 'ethereum', decimals: 8 },
      'BCH': { name: 'Bitcoin Cash', chain: 'ethereum', decimals: 8 },
      'SHIB': { name: 'Shiba Inu', chain: 'ethereum', decimals: 18 },
      'OP': { name: 'Optimism', chain: 'optimism', decimals: 18 },
      'SAND': { name: 'The Sandbox', chain: 'ethereum', decimals: 18 },
      'MANA': { name: 'Decentraland', chain: 'ethereum', decimals: 18 },
      'CRV': { name: 'Curve DAO', chain: 'ethereum', decimals: 18 },
      'SNX': { name: 'Synthetix', chain: 'ethereum', decimals: 18 },
      'DYDX': { name: 'dYdX', chain: 'ethereum', decimals: 18 },
      'COMP': { name: 'Compound', chain: 'ethereum', decimals: 18 },
      'ENS': { name: 'Ethereum Name Service', chain: 'ethereum', decimals: 18 },
      'RPL': { name: 'Rocket Pool', chain: 'ethereum', decimals: 18 },
      'LDO': { name: 'Lido DAO', chain: 'ethereum', decimals: 18 },
      'GRT': { name: 'The Graph', chain: 'ethereum', decimals: 18 },
      'PEPE': { name: 'Pepe', chain: 'ethereum', decimals: 18 },
    };
    
    const tokenData = tokenMap[symbol] || { name: symbol, chain: 'ethereum', decimals: 18 };
    
    return {
      token: symbol,
      chain: tokenData.chain,
      symbol: symbol,
      name: tokenData.name,
      decimals: tokenData.decimals,
    };
  }).filter((token): token is Token => token !== null);
}

const TOKENS = getPythTokens();

export default function TokenSelector({ tokens, value, onChange, placeholder }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTokens = (tokens || []).filter(token =>
    token.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTokenSelect = (token: string) => {
    onChange(token);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full justify-between h-9 text-sm"
      >
        <div className="flex items-center space-x-1.5">
          <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-[10px] text-primary-foreground font-bold">
            {value ? value.charAt(0) : '?'}
          </div>
          <span className="font-semibold">{value || placeholder || 'Select'}</span>
        </div>
        <ChevronDown className="w-3.5 h-3.5" />
      </Button>

      {isOpen && (
        <Card className="absolute top-full left-0 right-0 min-w-[200px] mt-2 z-50 max-h-72 overflow-hidden shadow-xl">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search tokens..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          
          <div className="max-h-56 overflow-y-auto">
            {filteredTokens.map((token) => (
              <button
                key={token}
                onClick={() => handleTokenSelect(token)}
                className="w-full px-3 py-2 text-left hover:bg-muted transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-xs text-primary-foreground font-semibold">
                    {token.charAt(0)}
                  </div>
                  <div className="font-medium text-sm">{token}</div>
                </div>
                {value === token && (
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                )}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

