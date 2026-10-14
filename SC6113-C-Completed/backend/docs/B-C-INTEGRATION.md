# B/C Contract Integration Reference

## Responsibility boundary

- `RoleManager`, `ProjectEscrow` and `DisputeManager` are authoritative for roles, escrowed ETH and workflow state.
- MetaMask signs and broadcasts user transactions.
- The backend stores off-chain text and query-friendly mirrors only after verifying a mined transaction.
- The backend never receives or stores a private key.

## REST-to-contract mapping

| REST endpoint | B contract call accepted by C | Required actor |
|---|---|---|
| `POST /api/projects` | `ProjectEscrow.createProjectWithMilestones` | Client |
| `POST /api/projects/:id/accept` | `ProjectEscrow.acceptProject` | assigned Freelancer |
| `POST /api/projects/:id/fund` | `ProjectEscrow.fundProject` with exact `msg.value` | project Client |
| `POST /api/projects/:id/cancel` | `ProjectEscrow.cancelProject` | project Client |
| `POST /api/milestones/:id/start` | `ProjectEscrow.startMilestone` | assigned Freelancer |
| `POST /api/milestones/:id/submissions` | `submitMilestone` or `resubmitMilestone` | assigned Freelancer |
| `POST /api/milestones/:id/rejections` | `ProjectEscrow.rejectMilestone` | project Client |
| `POST /api/milestones/:id/approvals` | `approveMilestone` or `claimAfterReview` | Client or Freelancer as required by the chosen function |
| `POST /api/disputes` | `ProjectEscrow.raiseDispute` | either project party |
| `POST /api/disputes/:id/evidence` | `DisputeManager.submitEvidence` | either project party |
| `POST /api/disputes/:id/resolution-record` | `DisputeManager.resolveDispute` | authorised non-party Arbitrator |

Every EVM-mode request above includes `transactionHash`. Project creation also includes the full off-chain project and milestone data. C derives on-chain IDs from `ProjectCreated`, `MilestoneAdded` and `DisputeRaised`; callers must not invent them.

## Canonical values

Use `keccak256(toUtf8Bytes(JSON.stringify(value)))`. Property order is part of the byte representation.

| Contract hash field | Exact value passed to `JSON.stringify` |
|---|---|
| project metadata | `{ title, description }` |
| milestone metadata | `{ title, description }` |
| deliverable | `{ note, evidenceUrl }` (`null` when absent) |
| rejection reason | `{ reason }` |
| dispute reason | `{ description }` |
| dispute evidence | `{ evidence }` |
| resolution | `{ resolution }` |

Dates use `BigInt(Date.parse(date + 'T00:00:00Z') / 1000)`. Amounts use `parseEther(decimalString)`.

## Status mapping

Project enum: `0 None`, `1 Created`, `2 Accepted`, `3 Funded`, `4 Active`, `5 Disputed`, `6 Completed`, `7 Cancelled`.

Milestone enum: `0 Pending`, `1 InProgress`, `2 Submitted`, `3 Rejected`, `4 Approved`, `5 Disputed`, `6 Resolved`.

B permits both activation orders:

- create → accept → fund → active
- create → fund → accept → active

Funding does not start a milestone. `startMilestone` changes Pending to InProgress, while B also permits `submitMilestone` directly from Pending.

## Configuration

The backend needs `RPC_URL`, `CHAIN_ID`, `CHAIN_CONFIRMATIONS`, the three deployed addresses and `CONTRACT_ABI_DIRECTORY`. For the bundled local deployment, the defaults in `.env.example` match Hardhat's deterministic first deployment.

For a public network, replace every address with the values from that deployment. A local `localhost.json` file is not evidence of Sepolia deployment.
