# Freelancer Milestone Payment DApp — Frontend

Role-based React UI for a blockchain escrow system that manages projects after a Client and Freelancer have already agreed to work together. It covers project/milestone views, Client funding/review, Freelancer submissions, Arbitrator dispute resolution, transaction history, event logs, and dashboards.

## Stack

React, Vite, TypeScript, React Router, ethers v6, and lightweight CSS-based data visualisation.

## Run locally

```bash
npm install
npm run dev
```

The dev server prints the local URL. Create a local `.env` from `.env.example` only when real API/contract information is available.

## Build

```bash
npm run build
```

## Mock Mode

With no `VITE_API_BASE_URL`, the app uses `src/services/api/mockAdapter.ts`. It supports a complete classroom demo without a backend or deployed smart contract. Transaction buttons explicitly say Mock and never claim to send ETH or write to a chain.

## Environment variables

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL when C confirms it |
| `VITE_CONTRACT_ADDRESS` | Deployed address supplied by B |
| `VITE_CHAIN_ID` | Required hexadecimal chain ID supplied by B/E |
| `VITE_RPC_URL` | Optional read-only RPC endpoint |

Never add a private key to frontend environment variables.

## Integration

### Backend (C)

Implement the `ProjectAdapter` interface in `src/services/api/projectAdapter.ts`, create a REST implementation, and select it in `src/services/api/index.ts`. The exact frontend data requirements are in [docs/Backend_Integration_Requirements_for_C.md](docs/Backend_Integration_Requirements_for_C.md).

### Smart contract (B)

Put final configuration in `.env`, then replace the explicit TODO/Mock functions in `src/services/blockchain/wallet.ts` with an isolated contract service using B's ABI/function/event mapping. The required handoff is documented in [docs/Blockchain_Integration_Requirements_for_B.md](docs/Blockchain_Integration_Requirements_for_B.md).

## Current TODO

- Confirm backend API, persistence/authentication model, and file-evidence storage with C.
- Confirm ABI, addresses, network, events, custom errors, and direct-call responsibilities with B.
- Replace Mock transaction state and mock audit data after the integration interfaces are frozen.
- Add frontend automated tests after final API/contract behaviours are agreed.
