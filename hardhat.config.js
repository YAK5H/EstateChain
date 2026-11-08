const path = require("path");

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL || "";
const deployerKey = process.env.PRIVATE_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: sepoliaRpcUrl,
      accounts: deployerKey !== "" ? [deployerKey] : [],
      chainId: 11155111,
    },
  },
};
