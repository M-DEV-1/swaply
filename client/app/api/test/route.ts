import { NextResponse } from "next/server";
import { getGasPrice, getNativeBalance } from "../../../lib/partners/blockscout";

export async function GET() {
  const gas = await getGasPrice();
  const balance = await getNativeBalance("0x1f9090aaE28b8a3dCeaDf281B0F12828e676c326");

  return NextResponse.json({
    gas,
    balance,
  });
}
