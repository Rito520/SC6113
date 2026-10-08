# Backend Integration Requirements for C

**Status:** Suggested by Frontend — Pending Backend Confirmation. These are interface needs, not a mandated implementation.

## Shared response expectations

- Return JSON; timestamps in ISO 8601; ETH amounts as decimal strings to avoid JavaScript floating-point ambiguity.
- Use stable IDs (`projectId`, `milestoneId`, `disputeId`) and wallet addresses as strings.
- Return an explicit error code/message for authorization, invalid state transition, missing record, validation, and transaction-pending cases.

| Feature | Frontend page | Required data / action | Suggested method + endpoint | Expected response | Error cases | Priority |
|---|---|---|---|---|---|---|
| Role context | App header/dashboard | Current wallet role and display label | `GET /me?wallet=` | `{role, displayName}` | unknown/unregistered wallet | High |
| Dashboard | Dashboard | Counts/totals plus pending action count | `GET /dashboard?wallet=` | role metrics object | unavailable aggregate | High |
| Project list | Projects | Projects relevant to wallet, counterparty, total, date, state | `GET /projects?wallet=&role=` | `Project[]` | pagination/filter validation | High |
| Project detail | Project detail | Full descriptions, milestones, funding and submission fields | `GET /projects/:id` | `Project` | not found / unauthorized | High |
| Project creation | Create project | Persist off-chain descriptions + requested milestones after chain creation | `POST /projects` | created project | invalid wallet/deadline/total | High |
| Submit/resubmit | Project detail | Store comment/evidence URL/hash, associate chain reference | `POST /milestones/:id/submissions` | updated milestone | wrong role/state/file error | High |
| Reject | Project detail | Store rejection reason | `POST /milestones/:id/rejections` | updated milestone | wrong role/state | High |
| Dispute | Disputes | Description, related project/milestone, current result | `GET/POST /disputes` | `Dispute[]` / `Dispute` | duplicate/open-state/wrong role | High |
| Resolution record | Disputes | Persist confirmed binary decision and transaction result | `POST /disputes/:id/resolution-record` | updated dispute | not arbitrator / pending tx | Medium |
| Audit history | Transactions | type, actor, relevant ID, amount, timestamp, status, tx hash | `GET /transactions?wallet=&projectId=` | `Transaction[]` | bad filter | Medium |
| Events | Event logs | decoded event name, actor, details, tx hash, time | `GET /events?wallet=&projectId=` | `ChainEvent[]` | indexer unavailable | Medium |

## JSON mapping used by the frontend

`Project`: `id, title, description, clientAddress, clientName, freelancerAddress, freelancerName, totalAmountEth, deadline, status, funded, milestones[]`.

`Milestone`: `id, projectId, title, description, amountEth, dueDate, status, submissionNote?, rejectionReason?`.

`Transaction`: `id, type, projectId, user, amountEth?, timestamp, status, hash`.

## Integration location

Create a REST adapter implementing `src/services/api/projectAdapter.ts`, then change the adapter selection in `src/services/api/index.ts`. Pages must not require rewrites.
