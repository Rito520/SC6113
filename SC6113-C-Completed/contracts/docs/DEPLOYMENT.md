# Smart Contract Deployment Details

Freelancer Milestone Payment DApp: three contracts, paid in native ETH.

## Current deployment: Hardhat local network

| Item | Value |
|---|---|
| Network | Hardhat local node (`npx hardhat node`) |
| Chain ID | 31337 |
| RPC | http://127.0.0.1:8545 |
| Compiler | solc 0.8.24, optimizer on (200 runs), EVM target `cancun` |
| Libraries | OpenZeppelin Contracts 5.4.0 |
| Deployer / Admin | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Hardhat account #0) |

| Contract | Address | Deploy gas | Deploy tx |
|---|---|---:|---|
| RoleManager | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | 587,311 | `0x3f06761f…f4042` |
| ProjectEscrow | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` | 2,714,228 | `0xb3fd4092…e1495` |
| DisputeManager | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` | 801,651 | `0x64949dd5…5f070` |
| `ProjectEscrow.setDisputeManager` (wiring, once only) | | 50,921 | |
| **Total** | | **4,154,111** | |

Hardhat's local addresses are deterministic: a fresh `npx hardhat node` followed by the deploy script always
gives the addresses above, so the frontend (D) and backend (C) can hard-code them for local development.

Demo wallets created by `SEED_DEMO=true` (Hardhat default accounts, 10,000 test ETH each):

| Role | Account | Address |
|---|---|---|
| Admin | #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Client | #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Freelancer | #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Arbitrator | #3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |

Files:
- `deployments/localhost.json`: addresses, tx hashes, block numbers, gas, constructor args
- `deployments/abi/*.json`: ABIs for C and D
- `deployments/localhost-demo-transactions.json`: Scenario A + Scenario B from the requirements (18 transactions with hashes and gas)

## Deploying to Sepolia (public testnet)

1. Get Sepolia ETH for the deployer wallet from a faucet. Deployment uses ~4.2 M gas, so 0.02 ETH is plenty.
2. Set environment variables (never commit the private key):
   ```bash
   export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/<key>"   # or Alchemy
   export PRIVATE_KEY="0x<deployer private key>"
   export ETHERSCAN_API_KEY="<key>"                               # for verification
   ```
3. Deploy and wire:
   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   ```
   This writes `deployments/sepolia.json`. Do **not** set `SEED_DEMO` on a public network.
4. From the admin wallet, authorise arbitrators: `RoleManager.grantRole(ARBITRATOR_ROLE, <address>)`.
   Clients and freelancers register themselves from the DApp.
5. Verify on Etherscan with the constructor args stored in `deployments/sepolia.json`:
   ```bash
   npx hardhat verify --network sepolia <RoleManager> <admin>
   npx hardhat verify --network sepolia <ProjectEscrow> <RoleManager>
   npx hardhat verify --network sepolia <DisputeManager> <RoleManager> <ProjectEscrow>
   ```
6. Fill in the table and give `deployments/sepolia.json` + `deployments/abi/` to C and D.

| Contract | Sepolia address | Etherscan |
|---|---|---|
| RoleManager | _to fill_ | |
| ProjectEscrow | _to fill_ | |
| DisputeManager | _to fill_ | |

Cost estimate: 4.15 M gas × gas price. At 2 gwei that is ≈0.0083 ETH; at 20 gwei ≈0.083 ETH. On Sepolia it is free test ETH.
