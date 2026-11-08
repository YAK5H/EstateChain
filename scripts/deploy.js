
const hre = require("hardhat");

const SEPOLIA_CHAIN_ID = 11155111n;
const EXPECTED_DEPLOYER = "0x8104830bD1b0893340a2b3a5df146A2B607eCd73";

async function main() {
  if (hre.network.name !== "sepolia") {
    throw new Error("Deployment is allowed only on Sepolia.");
  }

  if (!process.env.SEPOLIA_RPC_URL || !process.env.PRIVATE_KEY) {
    throw new Error("Missing Sepolia deployment configuration in .env.");
  }

  const network = await hre.ethers.provider.getNetwork();
  const [deployer] = await hre.ethers.getSigners();

  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(`Wrong chain ID: ${network.chainId}`);
  }

  if (!deployer || !hre.ethers.isAddress(deployer.address)) {
    throw new Error("Invalid deployer account.");
  }

  if (deployer.address.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase()) {
    throw new Error(
      `Unexpected deployer: ${deployer.address}. Deployment stopped.`
    );
  }

  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("Network:", hre.network.name);
  console.log("Chain ID:", network.chainId.toString());
  console.log("Deployer:", deployer.address);
  console.log("Balance:", `${hre.ethers.formatEther(balance)} ETH`);

  const EstateChain = await hre.ethers.getContractFactory("EstateChain");
  const estateChain = await EstateChain.deploy();

  console.log("Deployment transaction:", estateChain.deploymentTransaction().hash);

  await estateChain.waitForDeployment();

  console.log("EstateChain deployed at:", await estateChain.getAddress());
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
