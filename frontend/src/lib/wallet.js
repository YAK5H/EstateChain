import { BrowserProvider } from "ethers";
import { SEPOLIA_CHAIN_ID, SEPOLIA_CHAIN_ID_HEX, SEPOLIA_RPC_URLS } from "./config.js";

/**
 * MetaMask injects window.ethereum. If several wallets are installed, pick MetaMask.
 * @returns {import("ethers").Eip1193Provider}
 */
export function getMetaMask() {
  if (typeof window === "undefined") {
    throw new Error("MetaMask is only available in the browser.");
  }

  const injected = window.ethereum;
  if (!injected) {
    throw new Error("MetaMask is not installed. Add the MetaMask extension, then refresh this page.");
  }

  const providers = injected.providers;
  if (Array.isArray(providers)) {
    const metaMask = providers.find((provider) => provider && provider.isMetaMask);
    if (metaMask) {
      return metaMask;
    }
  }

  if (injected.isMetaMask) {
    return injected;
  }

  throw new Error("MetaMask was not found. Disable other wallet extensions or set MetaMask as the active wallet.");
}

export function hasMetaMask() {
  try {
    getMetaMask();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask MetaMask for permission to use the selected account.
 * Does not change the network. Call assertSepolia or switchToSepolia after this.
 * @returns {Promise<{ provider: import("ethers").BrowserProvider, address: string }>}
 */
export async function connectWallet() {
  const ethereum = getMetaMask();
  const accounts = await ethereum.request({ method: "eth_requestAccounts" });

  if (!Array.isArray(accounts) || accounts.length === 0 || typeof accounts[0] !== "string") {
    throw new Error("MetaMask did not return an account.");
  }

  return {
    provider: new BrowserProvider(ethereum),
    address: accounts[0],
  };
}

/**
 * Refuse to continue unless this provider is Ethereum Sepolia.
 * @param {import("ethers").Provider} provider
 */
export async function assertSepolia(provider) {
  const network = await provider.getNetwork();

  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(
      `Wrong network. MetaMask is on chain ${network.chainId.toString()}, but EstateChain is deployed on Sepolia (${SEPOLIA_CHAIN_ID.toString()}).`,
    );
  }

  return network;
}

/**
 * Ask MetaMask to switch to Sepolia. If Sepolia is missing from the wallet, add it.
 */
export async function switchToSepolia() {
  const ethereum = getMetaMask();

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (error) {
    // 4902: the chain has not been added to this MetaMask installation.
    if (!error || error.code !== 4902) {
      throw error;
    }

    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: SEPOLIA_CHAIN_ID_HEX,
          chainName: "Sepolia",
          nativeCurrency: {
            name: "Sepolia ETH",
            symbol: "ETH",
            decimals: 18,
          },
          rpcUrls: SEPOLIA_RPC_URLS,
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        },
      ],
    });
  }
}
