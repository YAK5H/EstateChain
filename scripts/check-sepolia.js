const hre = require("hardhat");

const SEPOLIA_CHAIN_ID = 11155111n;

function safeMessage(error) {
  const message = error && error.message ? error.message : "Sepolia check failed.";
  const rpcUrl = process.env.SEPOLIA_RPC_URL || "";
  const privateKey = process.env.PRIVATE_KEY || "";
  const leaksSecret =
    (rpcUrl !== "" && message.includes(rpcUrl)) ||
    (privateKey !== "" && message.includes(privateKey)) ||
    /https?:\/\//i.test(message);

  if (leaksSecret) {
    return "Could not connect to Sepolia. Check SEPOLIA_RPC_URL and PRIVATE_KEY in .env.";
  }

  return message;
}

async function main() {
  if (!process.env.SEPOLIA_RPC_URL) {
    throw new Error("Set SEPOLIA_RPC_URL in .env before checking Sepolia.");
  }
  if (!process.env.PRIVATE_KEY) {
    throw new Error("Set PRIVATE_KEY in .env before checking Sepolia.");
  }

  const network = await hre.ethers.provider.getNetwork();
  const [deployer] = await hre.ethers.getSigners();

  console.log("Network:", hre.network.name);
  console.log("Chain ID:", network.chainId.toString());

  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(
      `Refusing to continue. Connected chain ID is ${network.chainId.toString()}, but Sepolia must be 11155111.`
    );
  }

  if (!deployer || !hre.ethers.isAddress(deployer.address) || deployer.address === hre.ethers.ZeroAddress) {
    throw new Error("The deployer address is missing or invalid.");
  }

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", `${hre.ethers.formatEther(balance)} ETH`);
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
