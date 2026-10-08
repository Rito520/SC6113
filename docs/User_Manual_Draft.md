# User Manual — Draft

## Start the system

1. Open the deployed frontend or run it locally using the README steps.
2. The app initially runs in **Mock Mode**, visibly labelled in the sidebar. This is a safe demo mode: it does not hold or move cryptocurrency.
3. Select **Client**, **Freelancer**, or **Arbitrator** from the header to demonstrate that role's dashboard and workflow.

## Connect MetaMask

1. Install and unlock MetaMask.
2. Select **Connect MetaMask** in the top-right corner and approve the connection.
3. The connected address is shown in the header. Account and network changes are detected automatically.
4. If MetaMask is absent, rejected, or on a mismatched configured network, the app shows an explanatory message. Network requirements will be confirmed before production integration.

## Role workflows

- **Client:** Create a project, assign a freelancer wallet, define milestones, then open project details to fund escrow and review submitted milestones. Approving a milestone releases its predefined payment; rejecting it requests rework.
- **Freelancer:** View assigned projects, accept a project, verify funding, submit work, or resubmit a rejected milestone. A rejected milestone can instead be disputed.
- **Arbitrator:** Open **Disputes**, inspect the project/milestone context and choose exactly one outcome: release to Freelancer or refund Client.

## Audit pages

- **Transaction history** lists user, amount where applicable, timestamp, status, and transaction-hash field.
- **Event logs** presents the relevant smart-contract event timeline.

## Transaction status

- **Preparing:** the app is preparing an action.
- **Pending:** a wallet/chain confirmation would be awaited in the real version.
- **Confirmed:** the current Mock UI state has been updated. It does **not** mean a real blockchain transaction occurred.
- **Failed:** reserved for future on-chain/reverted transaction errors.

## Current limitations

Project records, events, transactions, and action outcomes use local mock data. Real backend storage, contract calls, deployed addresses, ABI, and event indexing will be connected once C and B provide their confirmed interfaces.
