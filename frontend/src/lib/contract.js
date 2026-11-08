import { Contract, FallbackProvider, JsonRpcProvider } from "ethers";
import estateChainAbi from "../abi/EstateChain.json" with { type: "json" };
import { ESTATE_CHAIN_ADDRESS, SEPOLIA_CHAIN_ID, SEPOLIA_RPC_URLS } from "./config.js";
import { assertSepolia, connectWallet } from "./wallet.js";

/**
 * Read calls (propertyCount, properties, owner) use public Sepolia nodes.
 * No wallet and no project secret is required. If the first node fails, ethers
 * tries the next one.
 * @returns {import("ethers").Contract}
 */
export function getReadOnlyContract() {
  const provider = new FallbackProvider(
    SEPOLIA_RPC_URLS.map((url, index) => ({
      provider: new JsonRpcProvider(url, SEPOLIA_CHAIN_ID, { staticNetwork: true }),
      priority: index + 1,
      stallTimeout: 2000,
    })),
    SEPOLIA_CHAIN_ID,
    { quorum: 1 },
  );

  return new Contract(ESTATE_CHAIN_ADDRESS, estateChainAbi, provider);
}

/**
 * Write calls (buyTokens, registerProperty, and the other owner functions)
 * are sent by the connected MetaMask account. The wallet must already be on Sepolia.
 * @returns {Promise<import("ethers").Contract>}
 */
export async function getSignerContract() {
  const { provider } = await connectWallet();
  await assertSepolia(provider);
  const signer = await provider.getSigner();
  return new Contract(ESTATE_CHAIN_ADDRESS, estateChainAbi, signer);
}
