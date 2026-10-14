# SC6113 Freelancer Milestone Payment DApp — Backend

Member C's backend and database layer, integrated with Member B's `RoleManager`, `ProjectEscrow`, and `DisputeManager` contracts.

The browser remains responsible for asking MetaMask to sign every state-changing transaction. The backend never stores private keys or sends transactions for a user. In EVM mode it reads the mined transaction, verifies its chain, sender, destination, function, arguments, ETH value and confirmation count, decodes the emitted events, and only then stores the off-chain record.

## Implemented scope

- Express 5 and TypeScript REST API
- SQLite schema and automatic additive migrations
- MetaMask nonce/signature login
- roles read from B's `RoleManager.rolesOf`; multi-role wallets are supported
- project, milestone, submission, rejection, dispute, evidence and resolution records
- B contract IDs linked to local UUIDs
- amounts stored both as readable ETH strings and exact wei strings
- canonical `bytes32` hashes for off-chain descriptions and evidence
- verified transaction and decoded event audit tables
- Mock mode for isolated API tests and EVM mode for real contract integration
- OpenAPI reference and automated tests

## Project layout

In the completed handoff repository this backend is placed beside B's contracts:

```text
SC6113-C-Completed/
├─ contracts/                 B's Solidity and Hardhat project
├─ backend/                   this directory
│  ├─ src/
│  ├─ tests/
│  └─ docs/
├─ README.md
└─ 项目中文说明.md
```

## Quick start

Node.js 24 or later is required.

```powershell
# terminal 1
cd contracts
npm install
npm run node

# terminal 2
cd contracts
$env:SEED_DEMO='true'
npm run deploy:localhost

# terminal 3
cd backend
pnpm install
Copy-Item .env.example .env
# set CHAIN_MODE=evm
pnpm dev
```

The local deployment uses chain ID `31337`. `deploy.js` writes addresses to `contracts/deployments/localhost.json` and refreshes the three ABI files consumed by the backend. If deployment addresses change, copy them into `backend/.env` before starting the API.

For a backend-only demonstration, keep `CHAIN_MODE=mock`. Mock mode creates simulated hashes and must not be described as a real blockchain deployment.

## REST and contract transaction order

For a write operation in EVM mode:

1. The client computes the documented hash and sends the contract transaction through MetaMask.
2. The client waits for a mined receipt.
3. The client calls the matching REST endpoint with the same off-chain data and `transactionHash`.
4. The backend rejects any mismatch and stores the record only after verification.

Important routes include project creation, accept/fund/cancel, milestone start/submit/reject/approve, dispute creation, evidence submission and resolution. See `docs/openapi.yaml` and `docs/B-C-INTEGRATION.md` for the exact mapping.

## Hash and date rules

The backend uses:

```ts
keccak256(toUtf8Bytes(JSON.stringify(value)))
```

The JSON shapes and property order are fixed:

- project: `{ title, description }`
- milestone: `{ title, description }`
- submission: `{ note, evidenceUrl }`, where a missing URL is `null`
- rejection: `{ reason }`
- dispute: `{ description }`
- evidence: `{ evidence }`
- resolution: `{ resolution }`

A `YYYY-MM-DD` deadline is converted to Unix seconds at `00:00:00Z`. ETH amounts are JSON strings and are converted with `parseEther`; JavaScript floating-point numbers are not used.

## Validation

```powershell
cd contracts
npm test

cd ..\backend
pnpm typecheck
pnpm test
```

The optional EVM integration test expects a running local node and a seeded deployment plus demo flow:

```powershell
$env:RUN_EVM_INTEGRATION='true'
$env:CONTRACTS_DIRECTORY=(Resolve-Path '..\contracts')
pnpm build
node --test dist/tests/evm-gateway.integration.test.js
```

Current verified results are 32 passing Solidity tests, 2 passing backend API tests, and 1 passing real-receipt B/C integration test.

## Security and deployment notes

- Never commit wallet private keys or real secrets.
- On-chain state remains authoritative for financial status.
- SQLite is suitable for the current single-instance classroom demonstration. A multi-instance deployment should use a managed database and a proper migration tool.
- Production deployment still requires HTTPS, rate limiting, persistent session storage, RPC reliability controls and a confirmed public-network deployment.
- The included addresses are deterministic local Hardhat addresses, not Sepolia deployment evidence.
