# EstateChain

EstateChain is a beginner college project: a small real-estate tokenization demo. Later, an admin will register sample properties, each property will get its own ERC-20 share token, and a MetaMask user will buy those shares with Sepolia test ETH.

This repository is only the project scaffold. Smart contract logic and marketplace features are not written yet.

These tokens are simulated shares for learning. They are not legal title to land. Use Ethereum Sepolia or Hardhat’s local network. Do not use a wallet that holds real funds.

## Folder guide

| Path | Purpose |
| --- | --- |
| `contracts/` | Solidity sources. Empty until the contracts are added. |
| `scripts/` | Hardhat scripts such as deploy and sample data. Empty for now. |
| `test/` | Contract tests. Empty for now. |
| `hardhat.config.js` | Hardhat settings. Solidity 0.8.28. Sepolia is added only when `.env` has an RPC URL. |
| `frontend/` | React + Vite app. |
| `frontend/src/components/` | UI pieces. Empty for now. |
| `frontend/src/lib/` | Wallet and contract helpers. Empty for now. |
| `frontend/src/abi/` | Compiled contract ABI, copied here later. |
| `.env.example` | Names of the secrets needed for a later Sepolia deploy. |

Hardhat 2 is used with JavaScript (`hardhat.config.js`). The current Hardhat 3 initializer only ships TypeScript templates.

## Prerequisites (Windows, no WSL)

- Node.js 22 or newer
- npm
- PowerShell

## Install and check the scaffold

From `D:\EstateChain`:

```powershell
npm install
npx hardhat compile
npx hardhat test
```

`compile` currently reports that there is nothing to compile. `test` currently reports that there are no tests. That is expected.

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Vite prints a local URL, usually `http://localhost:5173`. The page is a placeholder title, not the marketplace.

## Sepolia secrets (not used yet)

When you are ready to deploy later, create `.env` from the example. Do not commit `.env`.

```powershell
Copy-Item .env.example .env
notepad .env
```

Fill in `SEPOLIA_RPC_URL` and `PRIVATE_KEY`. Nothing in this scaffold deploys a contract.
