// Public Sepolia settings for the browser. Do not put RPC keys or private keys here.
// The deployer secret stays in the project .env and is only used by Hardhat.

/** Deployed EstateChain contract on Ethereum Sepolia. */
export const ESTATE_CHAIN_ADDRESS = "0xC41E778f46D0F96b23E7134f074e1e883f5A3074";

/** Sepolia chain id. ethers v6 returns this as a bigint. */
export const SEPOLIA_CHAIN_ID = 11155111n;

/** Same chain id in the hex form MetaMask expects. */
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

/**
 * Public Sepolia endpoints with no API key.
 * Reads can happen before a wallet connects. Writes still go through MetaMask.
 * The first URL is preferred. The second is only a spare if that node is down.
 */
export const SEPOLIA_RPC_URLS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://1rpc.io/sepolia",
];

export const ESTATE_CHAIN_DEPLOYMENT_BLOCK = 12090043;