# Blockchain Integration Requirements for B

**Status:** Frontend integration request — does not define the final smart-contract interface.

## UI operations requiring wallet signing

| UI operation | Actor | Required result in UI | Event / error needed from B |
|---|---|---|---|
| Accept assigned project | Freelancer | pending/confirmed hash and new project status | acceptance event; unauthorized/wrong-state revert |
| Deposit full escrow | Client | amount, pending/confirmed hash, funded state | funding event; amount/state revert |
| Approve milestone + release payment | Client | payment release status and hash | approval/payment event; duplicate/wrong-state revert |
| Raise dispute | Client/Freelancer | open-dispute status and hash | dispute-created event; eligibility revert |
| Resolve to Freelancer | Arbitrator | resolution/payment status and hash | resolution/release event; arbitrator-only revert |
| Resolve to Client refund | Arbitrator | resolution/refund status and hash | resolution/refund event; arbitrator-only revert |

## Contract information needed before real integration

1. Contract ABI for every deployed contract and the final contract addresses.
2. Target test network name and hexadecimal `chainId`; whether switch/add-chain metadata is required.
3. Final function name, parameter types/order, `msg.value` requirement, payable status, and return shape for each operation above.
4. Exact events, indexed fields, and emitted IDs needed to update UI and audit history.
5. Enum numeric/string mapping for project and milestone states.
6. Revert error names/messages or custom error ABI for user-facing error mapping.
7. Whether operations are direct MetaMask calls or must go through Backend relay/indexer.

## Code handoff points

- Environment values: `.env` from `.env.example` (`VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID`, optional RPC URL).
- Wallet connection/network behaviour: `src/services/blockchain/wallet.ts`.
- Create a contract adapter/service next to `wallet.ts`; do **not** put ABI calls in page components.
- Replace `runMockTransaction()` and let button handlers receive actual `{ hash, wait/status }` results.
- Feed decoded events/transaction records into the API adapter or an event adapter used by `TransactionsPage` and `EventsPage`.

## Important frontend constraints

- No formal ABI, contract address, network, or transaction is assumed in this build.
- The front end needs confirmation that only authorized roles can invoke each final method; the UI alone must never be treated as security.
