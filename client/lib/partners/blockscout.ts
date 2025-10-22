/*
  Blockscout Integration for BetterETH Router
  API Docs: https://docs.blockscout.com/devs/apis
*/

export interface TokenBalance {
  address: string;
  tokenAddress: string;
  balance: number;
  symbol?: string;
  decimals?: number;
}

export interface TxStatus {
  hash: string;
  status: "pending" | "confirmed" | "failed";
  blockNumber?: number;
  gasUsed?: string;
}

export interface GasPrice {
  average: number;
  fast: number;
  slow: number;
  unit: string;
}

const BLOCKSCOUT_BASE = process.env.NEXT_PUBLIC_BLOCKSCOUT_BASE;

if (!BLOCKSCOUT_BASE) {
  throw new Error("BLOCKSCOUT BASE IS NOT DEFINED IN ENV VARIABLES");
}

// const API_KEY = process.env.NEXT_PUBLIC_BLOCKSCOUT_APIKEY || "";
// you don't need an API key for basic calls, if within basic limits

/* ---------- 1. Get ERC20 token balance ---------- */

export async function getTokenBalance(
  address: string,
  tokenAddress: string
): Promise<TokenBalance | null> {
  try {
    const url = `${BLOCKSCOUT_BASE}?module=account&action=tokenbalance&contractaddress=${tokenAddress}&address=${address}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== "1") return null;

    const balance = parseFloat(json.result) / 1e18; // adjust decimals later via token info
    return { address, tokenAddress, balance };
  } catch (err) {
    console.error("Blockscout Balance Error:", err);
    return null;
  }
}

/* ---------- 2. Get Transaction Status ---------- */

export async function getTxStatus(txHash: string): Promise<TxStatus | null> {
  try {
    const url = `${BLOCKSCOUT_BASE}?module=transaction&action=gettxreceiptstatus&txhash=${txHash}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.result)
      return { hash: txHash, status: "pending" };

    return {
      hash: txHash,
      status: json.result.status === "1" ? "confirmed" : "failed",
      blockNumber: parseInt(json.result.blockNumber),
      gasUsed: json.result.gasUsed,
    };
  } catch (err) {
    console.error("Blockscout Tx Error:", err);
    return null;
  }
}

/* ---------- 3. Get Gas Prices ---------- */

export async function getGasPrice(): Promise<GasPrice> {
  try {
    const res = await fetch(`${BLOCKSCOUT_BASE}?module=gastracker&action=gasoracle`);
    const json = await res.json();
    const result = json.result;
    return {
      average: parseFloat(result.SafeGasPrice),
      fast: parseFloat(result.FastGasPrice),
      slow: parseFloat(result.ProposeGasPrice),
      unit: "gwei",
    };
  } catch {
    return { average: 0, fast: 0, slow: 0, unit: "gwei" };
  }
}

/* ---------- 4. Validate Address or Contract ---------- */

export async function verifyContract(contractAddress: string): Promise<boolean> {
  try {
    const res = await fetch(`${BLOCKSCOUT_BASE}?module=contract&action=getsourcecode&address=${contractAddress}`);
    const json = await res.json();
    return json.status === "1" && json.result.length > 0;
  } catch {
    return false;
  }
}
