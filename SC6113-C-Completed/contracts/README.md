# SC6113 Part B – Smart Contracts: Freelancer Milestone Payment DApp

Solidity contracts for the group's **Freelancer Milestone Payment DApp**
(see `Freelancer_Milestone_Payment_Requirements_v1.md` in the group repo). A Client creates a project for one
Freelancer, splits it into milestones, and deposits the full amount in ETH. Each approved milestone pays the
Freelancer immediately. Rejected work can be resubmitted, and disputes are decided by an authorised Arbitrator
(release to the Freelancer or refund the Client).

| Contract | Purpose |
|---|---|
| `RoleManager` | OpenZeppelin AccessControl: ADMIN, CLIENT, FREELANCER, ARBITRATOR. Clients/Freelancers self-register; Admin authorises Arbitrators |
| `ProjectEscrow` | Projects, milestones, ETH escrow, approval / rejection / resubmission, payment release |
| `DisputeManager` | Dispute records, evidence log, the Arbitrator's binary decision |

## Quick start

```bash
npm install
npx hardhat compile
npx hardhat test                      # 32 tests
REPORT_GAS=true npx hardhat test      # gas table
npx hardhat coverage                  # coverage report
npx hardhat run scripts/gas-bench.js  # measured optimisation savings

# local chain for C (backend) and D (frontend)
npx hardhat node                                                     # terminal 1
SEED_DEMO=true npx hardhat run scripts/deploy.js --network localhost  # terminal 2
npx hardhat run scripts/demo-flow.js --network localhost              # optional: Scenario A + B
```

If binaries.soliditylang.org is unreachable, prefix commands with `USE_LOCAL_SOLC=true` to compile with the bundled solcjs.

MetaMask: add network RPC `http://127.0.0.1:8545`, chain ID `31337`, and import Hardhat accounts #0–#3
(private keys are printed by `npx hardhat node`). #0 Admin, #1 Client, #2 Freelancer, #3 Arbitrator.

## Layout

```
contracts/              RoleManager, ProjectEscrow, DisputeManager + interfaces/
                        mocks/RejectingReceiver.sol (test only), benchmarks/GasBench.sol (gas measurements only)
test/Escrow.test.js     32 tests, named after the requirement IDs they check (BR / FR / SR)
scripts/deploy.js       deploy + wire + optional demo seed; writes deployments/<network>.json and ABIs
scripts/demo-flow.js    Scenario A (normal payment) + Scenario B (dispute) from the requirements
scripts/gas-bench.js    measured gas savings
deployments/            addresses, tx hashes, ABIs (for C and D)
reports/                gas-report.txt, coverage.txt, gas-optimisation.md
docs/                   report section, deployment details, diagrams (SVG/PNG + Mermaid source)
```

## Contract interface for C (backend) and D (frontend)

Amounts are in **wei** (`ethers.parseEther("3")`). Status enums:

- `ProjectStatus`: 0 None, 1 CREATED, 2 ACCEPTED, 3 FUNDED, 4 ACTIVE, 5 DISPUTED, 6 COMPLETED, 7 CANCELLED
- `MilestoneStatus`: 0 PENDING, 1 IN_PROGRESS, 2 SUBMITTED, 3 REJECTED, 4 APPROVED, 5 DISPUTED, 6 RESOLVED

| Function | Caller | Notes |
|---|---|---|
| `RoleManager.registerAsClient()` / `registerAsFreelancer()` | any wallet | |
| `RoleManager.grantRole(ARBITRATOR_ROLE, addr)` / `revokeRole` | Admin | |
| `RoleManager.rolesOf(addr)` → `(admin, client, freelancer, arbitrator)` | view | pick the dashboard |
| `ProjectEscrow.createProject(freelancer, totalWei, deadline, metadataHash)` → `projectId` | Client | then `addMilestone` |
| `ProjectEscrow.createProjectWithMilestones(freelancer, deadline, metadataHash, amounts[], dueDates[], milestoneHashes[])` | Client | one tx; total = sum |
| `ProjectEscrow.addMilestone(projectId, amountWei, dueDate, metadataHash)` | Client | only while CREATED |
| `ProjectEscrow.acceptProject(projectId)` | Freelancer | |
| `ProjectEscrow.fundProject(projectId)` payable, `value = total` | Client | |
| `ProjectEscrow.cancelProject(projectId)` | Client | before ACTIVE; refunds deposit |
| `ProjectEscrow.startMilestone(projectId, i)` | Freelancer | optional PENDING → IN_PROGRESS |
| `ProjectEscrow.submitMilestone(projectId, i, deliverableHash)` | Freelancer | |
| `ProjectEscrow.approveMilestone(projectId, i)` | Client | pays the Freelancer |
| `ProjectEscrow.rejectMilestone(projectId, i, reasonHash)` | Client | no refund |
| `ProjectEscrow.resubmitMilestone(projectId, i, deliverableHash)` | Freelancer | after rejection |
| `ProjectEscrow.claimAfterReview(projectId, i)` | Freelancer | 7 days after submission with no review |
| `ProjectEscrow.raiseDispute(projectId, i, reasonHash)` | Client / Freelancer | SUBMITTED, REJECTED, or overdue |
| `DisputeManager.submitEvidence(disputeId, evidenceHash)` | Client / Freelancer | |
| `DisputeManager.resolveDispute(disputeId, releaseToFreelancer, resolutionHash)` | Arbitrator | true = pay Freelancer, false = refund Client |
| `ProjectEscrow.withdraw()` | anyone with `pendingWithdrawals` | only if an automatic transfer failed |
| `ProjectEscrow.pause()` / `unpause()` | Admin | |
| Views: `getProject`, `getMilestone`, `getMilestones`, `isFunded`, `projectParties`, `pendingWithdrawals`, `DisputeManager.getDispute`, `disputeCount`, `openDisputeCount` | | |

`*Hash` parameters are `bytes32`, e.g. `ethers.id(text)` or the hash of a file stored by the backend.
Titles, descriptions, reasons and files stay off-chain (Requirements §13–14).

Events to index for history and logs (FR-15, FR-16): `ProjectCreated`, `MilestoneAdded`, `ProjectAccepted`,
`ProjectFunded`, `ProjectActivated`, `ProjectCancelled`, `ProjectCompleted`, `MilestoneStarted`,
`MilestoneSubmitted` (with `resubmission` flag), `MilestoneRejected`, `MilestoneApproved`, `PaymentReleased`,
`FundsRefunded`, `DisputeRaised`, `DisputeSettled`, `PaymentDeferred`, `Withdrawn`, and in DisputeManager
`DisputeOpened`, `EvidenceSubmitted`, `DisputeResolved`. In RoleManager: `UserRegistered`, `RoleGranted`, `RoleRevoked`.

Errors are custom errors (e.g. `NotAuthorized`, `InvalidMilestoneStatus`, `IncorrectDeposit`), so ethers v6 decodes
them from the ABI for the error messages required by NFR-06.

## Choices made where the requirements are silent

- Client never reviews a submission: after 7 days the Freelancer can claim it (`claimAfterReview`).
- Freelancer misses a milestone due date: the Client can open a dispute on that milestone.
- Arbitrators are authorised by the Admin wallet that deployed the contracts.
- No platform fee.
- Funding before acceptance is also allowed (project waits in FUNDED); the normal flow is accept, then fund.
