# Freelancer Milestone Payment DApp
## Requirements Specification — Version 1.0

## 1. Project Overview

### 1.1 Project Title
**Freelancer Milestone Payment DApp**

### 1.2 Project Goal
The project aims to develop a blockchain-based payment and escrow system for freelance projects.

The system allows a client to create a freelance project, divide the project into payment milestones, and deposit the required funds into a smart-contract-based escrow.

The assigned freelancer completes and submits work for each milestone. After the client approves the submitted milestone, the corresponding payment is automatically released to the freelancer.

If a disagreement occurs, either the client or freelancer can raise a dispute. An authorized arbitrator can review the dispute and decide whether the milestone payment should be released to the freelancer or refunded to the client.

The main objective is to reduce payment-related trust problems between freelancers and clients while improving the transparency and traceability of milestone payments.

---

## 2. Real-World Problem

Freelance transactions involve a trust problem between clients and freelancers.

A freelancer may complete work but experience delayed payment, partial payment, or non-payment. On the other hand, a client may hesitate to pay in advance because there is no guarantee that the freelancer will complete the agreed work.

Existing freelance platforms usually address this problem through centralized escrow and dispute-resolution systems. However, users must depend on the platform operator to hold funds, maintain transaction records, release payments, enforce platform rules, and resolve disputes.

The proposed DApp uses smart contracts to hold milestone funds and enforce predefined payment rules. Important financial actions are recorded on-chain so that both parties can verify the status of payments and escrow funds.

> **Report note:** External evidence such as industry reports, research papers, or datasets should later be added to support the real-world problem analysis.

---

## 3. Project Scope

The system focuses on **payment management after a client and freelancer have already agreed to work together**.

To keep the project scope manageable, Version 1 does **not** operate as a complete freelance marketplace.

### Included Scope
- Project creation
- Freelancer assignment
- Milestone definition
- Project acceptance
- Escrow funding
- Milestone submission
- Milestone approval and rejection
- Payment release
- Dispute creation and resolution
- Transaction history
- Blockchain event logs
- Role-based dashboards

### Excluded Scope
- Public job listings
- Freelancer bidding
- Freelancer search
- Recommendation algorithms
- Ratings and reviews
- Messaging or chat
- Fiat payment gateways
- Real-world identity verification
- AI matching
- DAO governance
- Token rewards

The Client directly assigns a Freelancer using the Freelancer's wallet address.

---

## 4. Main User Roles

The system shall support at least three user roles.

### 4.1 Client
The Client creates and funds freelance projects.

The Client can:
- Connect a MetaMask wallet
- Create a project
- Assign a Freelancer
- Define project milestones
- Deposit project funds
- View project and milestone status
- Review milestone submissions
- Approve submitted milestones
- Reject submitted milestones
- Raise a dispute
- View payment and transaction history
- View blockchain event records

### 4.2 Freelancer
The Freelancer performs the work defined by the Client.

The Freelancer can:
- Connect a MetaMask wallet
- View projects assigned to their wallet
- Accept an assigned project
- View milestone requirements
- Verify whether project funds have been deposited
- Submit completed milestones
- Resubmit rejected milestones
- Receive approved milestone payments
- Raise a dispute
- View payment and transaction history
- View blockchain event records

### 4.3 Arbitrator
The Arbitrator handles disputes between Clients and Freelancers.

The Arbitrator can:
- Connect an authorized wallet
- View open disputes
- Review project and milestone information
- Review relevant transaction records
- Review dispute descriptions
- Resolve a dispute
- Release disputed funds to the Freelancer
- Refund disputed funds to the Client
- View previous dispute decisions

The Arbitrator shall not be able to freely withdraw project funds.

---

## 5. Core Business Decisions

### 5.1 Freelancer Assignment
The Client directly assigns one Freelancer to the project using the Freelancer's wallet address.

There is no open bidding or job application system.

### 5.2 Funding Model
The Client must deposit the **entire project payment amount upfront** before the project becomes active.

Example:

```text
Total project amount: 10 ETH

Milestone 1: 3 ETH
Milestone 2: 3 ETH
Milestone 3: 4 ETH
```

The total value of all milestones must equal the total project amount.

### 5.3 Milestone Rejection
If the Client rejects a submitted milestone, the Freelancer may:
1. Revise the work and resubmit the milestone; or
2. Raise a dispute.

A rejection does not automatically refund the Client.

### 5.4 Dispute Resolution
The Arbitrator uses a simplified binary decision.

The Arbitrator can:
- Release the disputed milestone amount to the Freelancer; or
- Refund the disputed milestone amount to the Client.

Partial settlement such as 70/30 splitting is not included in Version 1.

---

## 6. Core Business Flow

```text
Client connects wallet
        ↓
Client creates project
        ↓
Client assigns Freelancer
        ↓
Client creates milestones
        ↓
Freelancer accepts project
        ↓
Client deposits full project payment
        ↓
Project becomes ACTIVE
        ↓
Freelancer works on milestone
        ↓
Freelancer submits milestone
        ↓
Client reviews submission
        ↓
 ┌──────────────┴──────────────┐
 ↓                             ↓
APPROVE                       REJECT
 ↓                             ↓
Payment released          Freelancer revises
to Freelancer             and resubmits
                               ↓
                         or raises dispute
                               ↓
                       Arbitrator reviews
                               ↓
                    ┌──────────┴──────────┐
                    ↓                     ↓
             Release to              Refund to
             Freelancer               Client
```

The process continues until all milestones are completed or resolved.

---

## 7. Project Status

A Project may have the following states:

```text
CREATED
ACCEPTED
FUNDED
ACTIVE
DISPUTED
COMPLETED
CANCELLED
```

### CREATED
The Client has created the project, but the Freelancer has not yet accepted it.

### ACCEPTED
The assigned Freelancer has accepted the project.

### FUNDED
The Client has deposited the required project payment.

### ACTIVE
The project has been accepted and funded, and work may proceed.

### DISPUTED
At least one milestone has an active dispute.

### COMPLETED
All milestones have been completed or resolved, and all relevant funds have been released or refunded.

### CANCELLED
The project has been cancelled before active work begins.

---

## 8. Milestone Status

Each milestone may have the following states:

```text
PENDING
IN_PROGRESS
SUBMITTED
REJECTED
APPROVED
DISPUTED
RESOLVED
```

### PENDING
The milestone exists but work has not started.

### IN_PROGRESS
The Freelancer is currently working on the milestone.

### SUBMITTED
The Freelancer has submitted the milestone for review.

### REJECTED
The Client has rejected the submission.

### APPROVED
The Client has approved the milestone, and the corresponding payment has been released.

### DISPUTED
A dispute has been opened for the milestone.

### RESOLVED
The Arbitrator has resolved the dispute.

---

## 9. Business Rules

### BR-01
Only the Client who owns the project may fund the project.

### BR-02
Only the Client may create project milestones.

### BR-03
The total amount assigned to all milestones must equal the total project payment amount.

### BR-04
Only the assigned Freelancer may accept the project.

### BR-05
A project cannot become active until:
- The Freelancer has accepted it; and
- The Client has deposited the required project funds.

### BR-06
Only the assigned Freelancer may submit work for a milestone.

### BR-07
A Freelancer may only submit milestones belonging to an active project.

### BR-08
Only the project Client may approve or reject a milestone.

### BR-09
A milestone payment may only be released once.

### BR-10
The amount released for an approved milestone must equal the predefined milestone amount.

### BR-11
Neither the Client nor Freelancer may directly withdraw escrowed funds while an active dispute exists for that milestone.

### BR-12
Only an authorized Arbitrator may resolve a dispute.

### BR-13
A funded and active project cannot be freely cancelled by the Client.

### BR-14
No new milestones may be created after the project becomes active.

### BR-15
A completed milestone cannot return to an earlier status.

---

## 10. Functional Requirements

### FR-01 — Wallet Connection
The system shall allow users to connect a MetaMask wallet.

### FR-02 — User Role Identification
The system shall identify whether a connected wallet is acting as:
- Client
- Freelancer
- Arbitrator

### FR-03 — Project Creation
The Client shall be able to create a project containing:
- Project title
- Project description
- Freelancer wallet address
- Total payment amount
- Project deadline
- Milestone information

### FR-04 — Milestone Creation
The Client shall be able to define one or more milestones.

Each milestone shall contain:
- Milestone title
- Description
- Payment amount
- Due date
- Milestone status

### FR-05 — Project Acceptance
The assigned Freelancer shall be able to accept the project.

### FR-06 — Project Funding
The Client shall be able to deposit the full project payment into escrow.

### FR-07 — Funding Verification
The Freelancer shall be able to verify whether the project has been fully funded.

### FR-08 — Milestone Submission
The Freelancer shall be able to submit a milestone for Client review.

### FR-09 — Milestone Approval
The Client shall be able to approve a submitted milestone.

### FR-10 — Payment Release
Approval of a milestone shall release the predefined milestone payment to the Freelancer.

### FR-11 — Milestone Rejection
The Client shall be able to reject a submitted milestone and provide a reason.

### FR-12 — Milestone Resubmission
The Freelancer shall be able to resubmit a rejected milestone.

### FR-13 — Dispute Creation
The Client or Freelancer shall be able to open a dispute for a milestone.

### FR-14 — Dispute Resolution
The Arbitrator shall be able to resolve an active dispute by:
- Releasing funds to the Freelancer; or
- Refunding funds to the Client.

### FR-15 — Transaction History
Users shall be able to view transaction history related to their projects.

### FR-16 — Blockchain Event Logs
Users shall be able to view relevant smart-contract events.

### FR-17 — Role-Based Dashboard
The system shall provide different dashboard information depending on the user's role.

---

## 11. Dashboard Requirements

### 11.1 Client Dashboard
Display:
- Total Projects Created
- Active Projects
- Completed Projects
- Total Funds in Escrow
- Total Payments Released
- Submitted Milestones Awaiting Review
- Open Disputes

### 11.2 Freelancer Dashboard
Display:
- Total Assigned Projects
- Active Projects
- Completed Projects
- Total Earnings
- Pending Payments
- Milestones Awaiting Client Review
- Open Disputes

### 11.3 Arbitrator Dashboard
Display:
- Open Disputes
- Resolved Disputes
- Dispute Details
- Related Project
- Related Milestone
- Escrow Amount
- Relevant Transaction History

---

## 12. On-Chain Data

The following information should be considered trust-sensitive and therefore stored or represented on-chain:

- Wallet addresses
- User role or authorized Arbitrator information
- Project identifier
- Client wallet address
- Freelancer wallet address
- Total project payment
- Milestone identifiers
- Milestone payment amounts
- Financial status
- Escrowed balance
- Milestone approval status
- Payment release
- Dispute status
- Dispute resolution
- Critical blockchain events

The exact Solidity data structures will be determined by the Smart Contract developer.

---

## 13. Off-Chain Data

The following data does not need to be permanently stored on-chain:

- User display name
- Profile information
- Full project description
- Detailed milestone descriptions
- Milestone submission comments
- Rejection reasons
- Dispute explanations
- File metadata
- UI data
- Cached dashboard data

The exact database structure will be determined by the Backend/Database developer.

---

## 14. File Submission

Freelancers may need to provide evidence of milestone completion.

Actual documents or large files should not be stored directly on-chain.

The system may instead store files in off-chain storage and record:
- File metadata
- URL or reference
- Optional document hash

This avoids unnecessary blockchain storage costs.

---

## 15. Non-Functional Requirements

### NFR-01 — Security
The system shall prevent unauthorized roles from performing restricted actions.

### NFR-02 — Reliability
The system shall prevent duplicate payment release.

### NFR-03 — Transparency
Users shall be able to verify important financial transactions through blockchain records.

### NFR-04 — Usability
The interface shall clearly display:
- Wallet connection status
- Project status
- Milestone status
- Payment status
- Transaction status

### NFR-05 — Responsiveness
The user interface shall work on common desktop resolutions and remain usable on smaller displays.

### NFR-06 — Error Handling
The system shall provide meaningful error messages for:
- Wallet transaction rejection
- Insufficient funds
- Unauthorized actions
- Invalid project states
- Invalid milestone states
- Backend failure
- Blockchain network failure

### NFR-07 — Maintainability
Frontend, backend, database, and smart-contract modules should remain modular and clearly separated.

### NFR-08 — Performance
Normal off-chain API requests should complete within a reasonable response time under the expected demonstration workload.

---

## 16. Security Requirements

### SR-01
Role-based access control shall be enforced.

### SR-02
Unauthorized wallets shall not approve milestones.

### SR-03
Unauthorized wallets shall not resolve disputes.

### SR-04
A milestone payment shall not be withdrawable more than once.

### SR-05
Invalid state transitions shall revert.

For example:

```text
APPROVED → SUBMITTED
```

shall not be allowed.

### SR-06
The contract shall prevent payment release when escrow balance is insufficient.

### SR-07
Sensitive personal information shall not be permanently stored on the public blockchain.

### SR-08
Smart contracts shall include appropriate exception and revert handling.

---

## 17. Why Blockchain Is Appropriate

Blockchain is used only for the parts of the system where trust and financial state are important.

### 17.1 Smart-Contract Escrow
Funds can be locked in a smart contract instead of being directly controlled by either the Client or Freelancer.

This reduces the need for either party to fully trust the other party.

### 17.2 Transparent Payment Records
Important payment-related actions are recorded on-chain.

Both parties can independently verify:
- Whether funds were deposited
- Whether a milestone was approved
- Whether payment was released
- How a dispute was resolved

### 17.3 Rule-Based Payment Execution
Smart contracts can enforce predefined payment rules.

Example:

```text
Milestone approved
        ↓
Check correct state
        ↓
Check escrow balance
        ↓
Release predefined amount
```

This reduces reliance on a centralized platform operator for normal payment execution.

### 17.4 Hybrid Design
Not all information needs blockchain.

A centralized database is more suitable for:
- Profiles
- Descriptions
- Files
- Comments
- UI information

Therefore, the system will use a hybrid architecture:

```text
Blockchain
→ trust-sensitive financial state

Backend + Database
→ ordinary application data
```

---

## 18. Measurable Success Indicators

### SI-01 — Core Workflow Completion
All defined core workflows shall execute successfully during system testing.

### SI-02 — Payment Accuracy
100% of tested approved milestones shall release the correct predefined milestone amount.

### SI-03 — Duplicate Payment Prevention
No tested milestone shall allow payment to be released twice.

### SI-04 — Access Control
Unauthorized users shall be blocked from restricted operations in all defined permission test cases.

### SI-05 — Transaction Traceability
All critical financial actions shall generate a traceable blockchain transaction or event.

### SI-06 — Dispute Handling
The complete dispute workflow shall be executable from dispute creation to final resolution.

### SI-07 — Usability
Users participating in scenario-based testing should be able to complete the main workflow with minimal guidance.

---

## 19. Practical and Real-World Constraints

### 19.1 Cryptocurrency / Testnet
The project will use test cryptocurrency rather than real-world money.

### 19.2 Regulation
A production financial platform may need to consider:
- KYC
- AML
- Tax rules
- Payment regulations
- Different legal jurisdictions

### 19.3 Dispute Resolution
Blockchain cannot determine whether freelance work is objectively satisfactory.

Human judgment is still required for disputes.

### 19.4 Smart Contract Risk
A contract bug could affect escrowed funds.

Contract testing, access control, and safe state transitions are therefore important.

### 19.5 Transaction Fees
Blockchain gas costs may reduce the suitability of the system for very small payments.

### 19.6 Privacy
Public blockchain data is visible and should not contain sensitive personal or project information.

### 19.7 Asset Volatility
Cryptocurrency price volatility may make real-world pricing difficult unless stable-value assets are used.

---

## 20. Core End-to-End Scenarios

### Scenario A — Normal Payment Flow

```text
1. Client connects MetaMask
2. Client creates project
3. Client assigns Freelancer
4. Client creates milestones
5. Freelancer connects wallet
6. Freelancer accepts project
7. Client deposits full project amount
8. Freelancer submits milestone
9. Client approves milestone
10. Payment is released automatically
11. Transaction appears in history
12. Blockchain event is displayed
```

### Scenario B — Dispute Flow

```text
1. Freelancer submits milestone
2. Client rejects milestone
3. Freelancer opens dispute
4. Arbitrator reviews dispute
5. Arbitrator resolves dispute
6. Funds are released or refunded
7. Updated state appears in dashboard
```

---

## 21. Information to Pass to Other Members

### For B — Smart Contract / Blockchain
B should use this document to design:
- At least 3 interacting smart contracts
- Role permissions
- Project and milestone state transitions
- Escrow logic
- Payment release logic
- Dispute logic
- At least 10 blockchain transaction types
- Main contract functions, parameters, return values, and events

Once the contract interface is agreed, function names, parameters, and events should be kept stable where possible.

### For C — Backend / Database
C should use this document to determine:
- Which data belongs on-chain and off-chain
- Database structure
- Project, milestone, submission, and dispute data
- Backend modules
- Required REST APIs
- Required dashboard data
- Blockchain read/event integration

C should finalize API details after receiving the contract interface from B.

### For D — Frontend / MetaMask
D should use this document to design:
- Role-based page structure
- Client workflow
- Freelancer workflow
- Arbitrator workflow
- Dashboard layout
- Project and milestone pages
- Transaction history
- Event logs
- MetaMask connection and transaction signing

Mock data may be used before the backend APIs are ready.

### For E — Testing / Deployment / Integration
E should use this document to prepare:
- GitHub structure and integration rules
- Test plan
- End-to-end scenarios
- Role and permission test cases
- Error test cases
- Deployment plan
- Final system integration process

---

## 22. Version Control Note

This document is the current **business requirements baseline** for Version 1.

If a requirement is technically difficult, inconsistent, or needs to change, the issue should be discussed before changing the business logic.

Changes affecting smart-contract interfaces, backend APIs, or frontend flows should be communicated to all affected members before implementation.
