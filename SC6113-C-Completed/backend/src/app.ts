import cors from 'cors'
import express, { type RequestHandler } from 'express'
import helmet from 'helmet'
import { formatEther, keccak256, parseEther, toUtf8Bytes } from 'ethers'
import { z } from 'zod'
import { issueNonce, normalizeWallet, requireAuth, requireRole, verifyWalletSignature } from './auth.js'
import type { BlockchainGateway, VerifyActionRequest } from './blockchain.js'
import type { AppConfig } from './config.js'
import { getUserRoles, inTransaction, upsertUserRoles, type AppDatabase } from './database.js'
import { ApiError, errorHandler, notFoundHandler } from './errors.js'
import {
  amountTotal,
  assertProjectAccess,
  assertRole,
  assertStatus,
  completeProjectIfFinished,
  findMilestone,
  findProjectRow,
  getProject,
  listProjects,
  uniqueId,
} from './repository.js'
import {
  disputeSchema,
  evidenceSchema,
  projectCreateSchema,
  rejectionSchema,
  resolutionSchema,
  submissionSchema,
  transactionSchema,
  walletSchema,
} from './validation.js'

interface Dependencies {
  database: AppDatabase
  config: AppConfig
  blockchain: BlockchainGateway
}

const asyncRoute = (handler: (...args: Parameters<RequestHandler>) => Promise<void>): RequestHandler =>
  (request, response, next) => void handler(request, response, next).catch(next)

const contentHash = (value: unknown): string => keccak256(toUtf8Bytes(JSON.stringify(value)))
const dateToUnix = (date: string): bigint => BigInt(Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000))

export const createApp = ({ database, config, blockchain }: Dependencies) => {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: config.frontendOrigin, credentials: false }))
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', chainMode: blockchain.mode, timestamp: new Date().toISOString() })
  })

  app.post('/api/auth/nonce', asyncRoute(async (request, response) => {
    const { wallet } = z.object({ wallet: walletSchema }).parse(request.body)
    if (blockchain.mode === 'evm') {
      const roles = await blockchain.getRoles(wallet)
      if (roles.length === 0) throw new ApiError(403, 'UNREGISTERED_ON_CHAIN', 'Register this wallet in RoleManager first.')
      upsertUserRoles(database, wallet, roles)
    }
    response.json(issueNonce(database, config, wallet))
  }))

  app.post('/api/auth/verify', (request, response) => {
    const { wallet, signature } = z.object({
      wallet: walletSchema,
      signature: z.string().min(10),
    }).parse(request.body)
    response.json(verifyWalletSignature(database, config, wallet, signature))
  })

  app.use('/api', requireAuth(database))

  app.get('/api/me', (request, response) => response.json(request.authUser))

  app.get('/api/projects', (request, response) => {
    response.json(listProjects(database, request.authUser!))
  })

  app.get('/api/projects/:id', (request, response) => {
    const row = findProjectRow(database, String(request.params.id))
    if (!row) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'The project does not exist.')
    assertProjectAccess(database, row, request.authUser!)
    response.json(getProject(database, row.id))
  })

  app.post('/api/projects', requireRole('CLIENT'), asyncRoute(async (request, response) => {
    const input = projectCreateSchema.parse(request.body)
    const user = request.authUser!
    const freelancer = normalizeWallet(input.freelancerAddress)
    if (blockchain.mode === 'evm') upsertUserRoles(database, freelancer, await blockchain.getRoles(freelancer))
    if (!getUserRoles(database, freelancer).includes('FREELANCER')) {
      throw new ApiError(400, 'INVALID_FREELANCER', 'The assigned wallet must be registered as a Freelancer.')
    }
    if (Date.parse(input.deadline) < Date.now()) {
      throw new ApiError(400, 'INVALID_DEADLINE', 'The project deadline must be in the future.')
    }
    if (parseEther(amountTotal(input.milestones.map((milestone) => milestone.amountEth))) !== parseEther(input.totalAmountEth)) {
      throw new ApiError(400, 'MILESTONE_TOTAL_MISMATCH', 'Milestone amounts must equal the total project payment.')
    }
    if (input.milestones.some((milestone) => Date.parse(milestone.dueDate) > Date.parse(input.deadline))) {
      throw new ApiError(400, 'MILESTONE_AFTER_PROJECT_DEADLINE', 'A milestone due date cannot be after the project deadline.')
    }

    const projectHash = contentHash({ title: input.title, description: input.description })
    const creationReceipt = await blockchain.verifyAction({
      transactionHash: input.transactionHash,
      actor: user.wallet,
      contract: 'projectEscrow',
      functions: ['createProjectWithMilestones'],
      expectedArgs: { 0: freelancer, 1: dateToUnix(input.deadline), 2: projectHash },
    })
    const createdEvent = creationReceipt.events.find((event) => event.name === 'ProjectCreated')
    const addedEvents = creationReceipt.events.filter((event) => event.name === 'MilestoneAdded')
    if (blockchain.mode === 'evm' && (!createdEvent || addedEvents.length !== input.milestones.length)) {
      throw new ApiError(422, 'CREATION_EVENTS_MISMATCH', 'ProjectCreated and MilestoneAdded events do not match the request.')
    }
    if (blockchain.mode === 'evm') {
      if (createdEvent!.args.totalAmount !== parseEther(input.totalAmountEth).toString()) {
        throw new ApiError(422, 'PROJECT_TOTAL_MISMATCH', 'ProjectCreated total does not match the REST request.')
      }
      input.milestones.forEach((milestone, index) => {
        const event = addedEvents[index]!
        const expectedHash = contentHash({ title: milestone.title, description: milestone.description })
        if (event.args.amount !== parseEther(milestone.amountEth).toString()
          || event.args.dueDate !== dateToUnix(milestone.dueDate).toString()
          || String(event.args.metadataHash).toLowerCase() !== expectedHash.toLowerCase()) {
          throw new ApiError(422, 'MILESTONE_EVENT_MISMATCH', `MilestoneAdded event ${index} does not match the REST request.`)
        }
      })
    }
    const chainProjectId = createdEvent ? String(createdEvent.args.projectId) : (input.chainProjectId ?? null)
    const projectId = uniqueId('P')
    const now = new Date().toISOString()
    inTransaction(database, () => {
      database.prepare(`
        INSERT INTO projects (id, chain_project_id, chain_id, title, description, client_address, freelancer_address,
          total_amount_eth, amount_wei, metadata_hash, deadline, status, funded, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', 0, ?, ?)
      `).run(projectId, chainProjectId, config.chainId, input.title, input.description, user.wallet, freelancer,
        input.totalAmountEth, parseEther(input.totalAmountEth).toString(), projectHash, input.deadline, now, now)
      const statement = database.prepare(`
        INSERT INTO milestones (id, project_id, chain_milestone_id, title, description, amount_eth, amount_wei,
          metadata_hash, due_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `)
      input.milestones.forEach((milestone, index) => {
        const chainIndex = addedEvents[index] ? String(addedEvents[index]!.args.index) : (milestone.chainMilestoneId ?? String(index))
        statement.run(uniqueId('M'), projectId, chainIndex, milestone.title, milestone.description,
          milestone.amountEth, parseEther(milestone.amountEth).toString(),
          contentHash({ title: milestone.title, description: milestone.description }), milestone.dueDate, now, now)
      })
      database.prepare(`
        INSERT INTO blockchain_transactions (id, type, project_id, user_address, amount_eth, timestamp, status,
          tx_hash, chain_id, block_number, transaction_index, contract_address, function_name)
        VALUES (?, 'Project created', ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?)
      `).run(uniqueId('T'), projectId, user.wallet, input.totalAmountEth, now, creationReceipt.transactionHash,
        config.chainId, creationReceipt.blockNumber ?? null, creationReceipt.transactionIndex ?? null,
        config.contractAddresses.projectEscrow.toLowerCase(), creationReceipt.functionName ?? 'createProjectWithMilestones')
      const creationEvents = creationReceipt.events.length > 0 ? creationReceipt.events : [{
        name: 'ProjectCreated', address: config.contractAddresses.projectEscrow.toLowerCase(), args: { projectId: chainProjectId ?? projectId },
        blockNumber: creationReceipt.blockNumber ?? 0, transactionIndex: creationReceipt.transactionIndex ?? 0, logIndex: 0,
      }]
      for (const event of creationEvents) {
        database.prepare(`
          INSERT OR IGNORE INTO chain_events (id, event_name, project_id, actor, details, timestamp, tx_hash,
            block_number, transaction_index, log_index, contract_address)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(uniqueId('E'), event.name, projectId, user.wallet, JSON.stringify({ args: event.args }), now,
          creationReceipt.transactionHash, event.blockNumber || null, event.transactionIndex, event.logIndex, event.address)
      }
    })
    response.status(201).json(getProject(database, projectId))
  }))

  const recordAudit = async (options: {
    projectId: string
    actor: string
    type: string
    eventName: string
    details: string
    amountEth?: string
    transactionHash?: string
    verification: Omit<VerifyActionRequest, 'actor' | 'transactionHash'>
  }): Promise<string> => {
    const receipt = await blockchain.verifyAction({
      ...options.verification,
      actor: options.actor,
      transactionHash: options.transactionHash,
    })
    const now = new Date().toISOString()
    database.prepare(`
      INSERT INTO blockchain_transactions (id, type, project_id, user_address, amount_eth, timestamp, status, tx_hash,
        chain_id, block_number, transaction_index, contract_address, function_name)
      VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?)
    `).run(uniqueId('T'), options.type, options.projectId, options.actor, options.amountEth ?? null, now,
      receipt.transactionHash, config.chainId, receipt.blockNumber ?? null, receipt.transactionIndex ?? null,
      config.contractAddresses[options.verification.contract].toLowerCase(), receipt.functionName ?? options.verification.functions[0] ?? 'unknown')
    const events = receipt.events.length > 0 ? receipt.events : [{
      name: options.eventName, address: config.contractAddresses[options.verification.contract].toLowerCase(), args: {},
      blockNumber: receipt.blockNumber ?? 0, transactionIndex: receipt.transactionIndex ?? 0, logIndex: 0,
    }]
    for (const event of events) {
      database.prepare(`
        INSERT OR IGNORE INTO chain_events (id, event_name, project_id, actor, details, timestamp, tx_hash,
          block_number, transaction_index, log_index, contract_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uniqueId('E'), event.name, options.projectId, options.actor,
        JSON.stringify({ summary: options.details, args: event.args }), now, receipt.transactionHash,
        event.blockNumber || null, event.transactionIndex, event.logIndex, event.address)
    }
    return receipt.transactionHash
  }

  app.post('/api/projects/:id/accept', requireRole('FREELANCER'), asyncRoute(async (request, response) => {
    const project = findProjectRow(database, String(request.params.id))
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'The project does not exist.')
    const user = request.authUser!
    if (project.freelancer_address !== user.wallet) throw new ApiError(403, 'PROJECT_ACCESS_DENIED', 'Only the assigned Freelancer may accept this project.')
    assertStatus(project.status, ['CREATED', 'FUNDED'], 'Project')
    const txHash = await recordAudit({
      projectId: project.id, actor: user.wallet, type: 'Project accepted', eventName: 'ProjectAccepted',
      details: 'The assigned Freelancer accepted the project.', transactionHash: request.body?.transactionHash,
      verification: { contract: 'projectEscrow', functions: ['acceptProject'], expectedArgs: { 0: BigInt(project.chain_project_id ?? 0) } },
    })
    database.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
      .run(project.status === 'FUNDED' ? 'ACTIVE' : 'ACCEPTED', new Date().toISOString(), project.id)
    response.json({ project: getProject(database, project.id), transactionHash: txHash, chainMode: blockchain.mode })
  }))

  app.post('/api/projects/:id/fund', requireRole('CLIENT'), asyncRoute(async (request, response) => {
    const project = findProjectRow(database, String(request.params.id))
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'The project does not exist.')
    const user = request.authUser!
    if (project.client_address !== user.wallet) throw new ApiError(403, 'PROJECT_ACCESS_DENIED', 'Only the project Client may fund it.')
    assertStatus(project.status, ['CREATED', 'ACCEPTED'], 'Project')
    const txHash = await recordAudit({
      projectId: project.id, actor: user.wallet, type: 'Escrow funded', eventName: 'ProjectFunded',
      details: `${project.total_amount_eth} ETH deposited into escrow.`, amountEth: project.total_amount_eth,
      transactionHash: request.body?.transactionHash,
      verification: { contract: 'projectEscrow', functions: ['fundProject'],
        expectedArgs: { 0: BigInt(project.chain_project_id ?? 0) }, expectedValueWei: parseEther(project.total_amount_eth) },
    })
    const now = new Date().toISOString()
    inTransaction(database, () => {
      database.prepare('UPDATE projects SET funded = 1, status = ?, updated_at = ? WHERE id = ?')
        .run(project.status === 'ACCEPTED' ? 'ACTIVE' : 'FUNDED', now, project.id)
    })
    response.json({ project: getProject(database, project.id), transactionHash: txHash, chainMode: blockchain.mode })
  }))

  app.post('/api/projects/:id/cancel', requireRole('CLIENT'), asyncRoute(async (request, response) => {
    const input = transactionSchema.parse(request.body ?? {})
    const project = findProjectRow(database, String(request.params.id))
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'The project does not exist.')
    const user = request.authUser!
    if (project.client_address !== user.wallet) throw new ApiError(403, 'PROJECT_ACCESS_DENIED', 'Only the project Client may cancel it.')
    assertStatus(project.status, ['CREATED', 'ACCEPTED', 'FUNDED'], 'Project')
    const txHash = await recordAudit({
      projectId: project.id, actor: user.wallet, type: 'Project cancelled', eventName: 'ProjectCancelled',
      details: 'The Client cancelled the project before work began.', transactionHash: input.transactionHash,
      verification: { contract: 'projectEscrow', functions: ['cancelProject'], expectedArgs: { 0: BigInt(project.chain_project_id ?? 0) } },
    })
    database.prepare(`UPDATE projects SET status = 'CANCELLED', funded = 0, updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), project.id)
    response.json({ project: getProject(database, project.id), transactionHash: txHash, chainMode: blockchain.mode })
  }))

  app.post('/api/milestones/:id/start', requireRole('FREELANCER'), asyncRoute(async (request, response) => {
    const input = transactionSchema.parse(request.body ?? {})
    const milestone = findMilestone(database, String(request.params.id))
    const project = findProjectRow(database, milestone.project_id)!
    const user = request.authUser!
    if (project.freelancer_address !== user.wallet) throw new ApiError(403, 'PROJECT_ACCESS_DENIED', 'Only the assigned Freelancer may start this milestone.')
    assertStatus(project.status, ['ACTIVE'], 'Project')
    assertStatus(milestone.status, ['PENDING'], 'Milestone')
    const txHash = await recordAudit({
      projectId: project.id, actor: user.wallet, type: 'Milestone started', eventName: 'MilestoneStarted',
      details: `${milestone.id} moved to in progress.`, transactionHash: input.transactionHash,
      verification: { contract: 'projectEscrow', functions: ['startMilestone'],
        expectedArgs: { 0: BigInt(project.chain_project_id ?? 0), 1: BigInt(milestone.chain_milestone_id ?? 0) } },
    })
    database.prepare(`UPDATE milestones SET status = 'IN_PROGRESS', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), milestone.id)
    response.json({ project: getProject(database, project.id), transactionHash: txHash, chainMode: blockchain.mode })
  }))

  app.post('/api/milestones/:id/submissions', requireRole('FREELANCER'), asyncRoute(async (request, response) => {
    const input = submissionSchema.parse(request.body)
    const milestone = findMilestone(database, String(request.params.id))
    const project = findProjectRow(database, milestone.project_id)!
    const user = request.authUser!
    if (project.freelancer_address !== user.wallet) throw new ApiError(403, 'PROJECT_ACCESS_DENIED', 'Only the assigned Freelancer may submit this milestone.')
    assertStatus(project.status, ['ACTIVE'], 'Project')
    assertStatus(milestone.status, ['PENDING', 'IN_PROGRESS', 'REJECTED'], 'Milestone')
    const deliverableHash = contentHash({ note: input.note, evidenceUrl: input.evidenceUrl ?? null })
    const txHash = await recordAudit({
      projectId: project.id, actor: user.wallet, type: 'Milestone submitted', eventName: 'MilestoneSubmitted',
      details: `${milestone.id} submitted for Client review.`, transactionHash: input.transactionHash,
      verification: { contract: 'projectEscrow',
        functions: milestone.status === 'REJECTED' ? ['resubmitMilestone'] : ['submitMilestone'],
        expectedArgs: { 0: BigInt(project.chain_project_id ?? 0), 1: BigInt(milestone.chain_milestone_id ?? 0), 2: deliverableHash } },
    })
    const now = new Date().toISOString()
    inTransaction(database, () => {
      database.prepare(`
        INSERT INTO submissions (id, milestone_id, submitted_by, note, evidence_url, evidence_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uniqueId('S'), milestone.id, user.wallet, input.note, input.evidenceUrl ?? null, deliverableHash, now)
      database.prepare('UPDATE submissions SET transaction_hash = ? WHERE milestone_id = ? AND created_at = ?')
        .run(txHash, milestone.id, now)
      database.prepare(`
        UPDATE milestones SET status = 'SUBMITTED', submission_note = ?, rejection_reason = NULL, updated_at = ? WHERE id = ?
      `).run(input.note, now, milestone.id)
    })
    response.status(201).json({ project: getProject(database, project.id), transactionHash: txHash, chainMode: blockchain.mode })
  }))

  app.post('/api/milestones/:id/rejections', requireRole('CLIENT'), asyncRoute(async (request, response) => {
    const input = rejectionSchema.parse(request.body)
    const milestone = findMilestone(database, String(request.params.id))
    const project = findProjectRow(database, milestone.project_id)!
    const user = request.authUser!
    if (project.client_address !== user.wallet) throw new ApiError(403, 'PROJECT_ACCESS_DENIED', 'Only the project Client may reject this milestone.')
    assertStatus(milestone.status, ['SUBMITTED'], 'Milestone')
    const reasonHash = contentHash({ reason: input.reason })
    const txHash = await recordAudit({
      projectId: project.id, actor: user.wallet, type: 'Milestone rejected', eventName: 'MilestoneRejected',
      details: `${milestone.id} rejected by the Client.`, transactionHash: input.transactionHash,
      verification: { contract: 'projectEscrow', functions: ['rejectMilestone'],
        expectedArgs: { 0: BigInt(project.chain_project_id ?? 0), 1: BigInt(milestone.chain_milestone_id ?? 0), 2: reasonHash } },
    })
    const now = new Date().toISOString()
    inTransaction(database, () => {
      database.prepare(`INSERT INTO rejections (id, milestone_id, rejected_by, reason, created_at, reason_hash, transaction_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(uniqueId('R'), milestone.id, user.wallet, input.reason, now, reasonHash, txHash)
      database.prepare(`UPDATE milestones SET status = 'REJECTED', rejection_reason = ?, updated_at = ? WHERE id = ?`)
        .run(input.reason, now, milestone.id)
    })
    response.json({ project: getProject(database, project.id), transactionHash: txHash, chainMode: blockchain.mode })
  }))

  app.post('/api/milestones/:id/approvals', requireRole('CLIENT', 'FREELANCER'), asyncRoute(async (request, response) => {
    const milestone = findMilestone(database, String(request.params.id))
    const project = findProjectRow(database, milestone.project_id)!
    const user = request.authUser!
    const isClientApproval = project.client_address === user.wallet
    const isFreelancerClaim = project.freelancer_address === user.wallet
    if (!isClientApproval && !isFreelancerClaim) throw new ApiError(403, 'PROJECT_ACCESS_DENIED', 'Only a project party may release this milestone.')
    assertStatus(milestone.status, ['SUBMITTED'], 'Milestone')
    const transactionHash = z.object({ transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional() }).parse(request.body ?? {}).transactionHash
    const txHash = await recordAudit({
      projectId: project.id, actor: user.wallet, type: 'Payment released', eventName: 'PaymentReleased',
      details: `${milestone.amount_eth} ETH released for ${milestone.id}.`, amountEth: milestone.amount_eth, transactionHash,
      verification: { contract: 'projectEscrow', functions: isClientApproval ? ['approveMilestone'] : ['claimAfterReview'],
        expectedArgs: { 0: BigInt(project.chain_project_id ?? 0), 1: BigInt(milestone.chain_milestone_id ?? 0) } },
    })
    database.prepare(`UPDATE milestones SET status = 'APPROVED', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), milestone.id)
    completeProjectIfFinished(database, project.id)
    response.json({ project: getProject(database, project.id), transactionHash: txHash, chainMode: blockchain.mode })
  }))

  app.get('/api/disputes', (request, response) => {
    const user = request.authUser!
    let rows: Record<string, unknown>[]
    if (user.roles.includes('ARBITRATOR')) {
      rows = database.prepare('SELECT * FROM disputes ORDER BY created_at DESC').all() as unknown as Record<string, unknown>[]
    } else {
      rows = database.prepare(`
        SELECT d.* FROM disputes d JOIN projects p ON p.id = d.project_id
        WHERE p.client_address = ? OR p.freelancer_address = ? ORDER BY d.created_at DESC
      `).all(user.wallet, user.wallet) as unknown as Record<string, unknown>[]
    }
    response.json(rows.map(mapDispute))
  })

  app.post('/api/disputes', asyncRoute(async (request, response) => {
    const input = disputeSchema.parse(request.body)
    const user = request.authUser!
    if (!user.roles.includes('CLIENT') && !user.roles.includes('FREELANCER')) throw new ApiError(403, 'FORBIDDEN_ROLE', 'Only a project party can raise a dispute.')
    const milestone = findMilestone(database, input.milestoneId)
    if (milestone.project_id !== input.projectId) throw new ApiError(400, 'MILESTONE_PROJECT_MISMATCH', 'The milestone does not belong to the supplied project.')
    const project = findProjectRow(database, input.projectId)
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'The project does not exist.')
    assertProjectAccess(database, project, user)
    assertStatus(milestone.status, ['SUBMITTED', 'REJECTED'], 'Milestone')
    const existing = database.prepare(`SELECT 1 FROM disputes WHERE milestone_id = ? AND status = 'OPEN'`).get(milestone.id)
    if (existing) throw new ApiError(409, 'DUPLICATE_OPEN_DISPUTE', 'This milestone already has an open dispute.')
    const id = uniqueId('D')
    const reasonHash = contentHash({ description: input.description })
    const txReceiptHash = input.transactionHash
    const txHash = await recordAudit({
      projectId: project.id, actor: user.wallet, type: 'Dispute opened', eventName: 'DisputeRaised',
      details: `${id} opened for milestone ${milestone.id}.`, amountEth: milestone.amount_eth, transactionHash: txReceiptHash,
      verification: { contract: 'projectEscrow', functions: ['raiseDispute'],
        expectedArgs: { 0: BigInt(project.chain_project_id ?? 0), 1: BigInt(milestone.chain_milestone_id ?? 0), 2: reasonHash } },
    })
    const disputeEvent = database.prepare(`SELECT details FROM chain_events WHERE tx_hash = ? AND event_name = 'DisputeRaised' LIMIT 1`)
      .get(txHash) as { details: string } | undefined
    const chainDisputeId = disputeEvent ? String((JSON.parse(disputeEvent.details) as { args?: { disputeId?: string } }).args?.disputeId ?? '') : null
    const now = new Date().toISOString()
    inTransaction(database, () => {
      database.prepare(`
        INSERT INTO disputes (id, project_id, milestone_id, raised_by_role, raised_by_address, description, status,
          amount_eth, created_at, chain_dispute_id, reason_hash)
        VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)
      `).run(id, project.id, milestone.id,
        user.roles.includes('CLIENT') && project.client_address === user.wallet ? 'CLIENT' : 'FREELANCER',
        user.wallet, input.description, milestone.amount_eth, now, chainDisputeId || null, reasonHash)
      database.prepare(`UPDATE milestones SET status = 'DISPUTED', updated_at = ? WHERE id = ?`).run(now, milestone.id)
      database.prepare(`UPDATE projects SET status = 'DISPUTED', updated_at = ? WHERE id = ?`).run(now, project.id)
    })
    const dispute = database.prepare('SELECT * FROM disputes WHERE id = ?').get(id) as unknown as Record<string, unknown>
    response.status(201).json({ ...mapDispute(dispute), transactionHash: txHash, chainMode: blockchain.mode })
  }))

  app.post('/api/disputes/:id/resolution-record', requireRole('ARBITRATOR'), asyncRoute(async (request, response) => {
    const input = resolutionSchema.parse(request.body)
    const disputeId = String(request.params.id)
    const dispute = database.prepare('SELECT * FROM disputes WHERE id = ?').get(disputeId) as unknown as Record<string, unknown> | undefined
    if (!dispute) throw new ApiError(404, 'DISPUTE_NOT_FOUND', 'The dispute does not exist.')
    assertStatus(String(dispute.status), ['OPEN'], 'Dispute')
    const user = request.authUser!
    const resolutionHash = contentHash({ resolution: input.resolution })
    const txHash = await recordAudit({
      projectId: String(dispute.project_id), actor: user.wallet, type: 'Dispute resolved', eventName: 'DisputeResolved',
      details: `${disputeId} resolved as ${input.resolution}.`, amountEth: String(dispute.amount_eth),
      transactionHash: input.transactionHash,
      verification: { contract: 'disputeManager', functions: ['resolveDispute'],
        expectedArgs: { 0: BigInt(String(dispute.chain_dispute_id ?? 0)),
          1: input.resolution === 'RELEASE_TO_FREELANCER', 2: resolutionHash } },
    })
    const now = new Date().toISOString()
    inTransaction(database, () => {
      database.prepare(`
        UPDATE disputes SET status = 'RESOLVED', resolution = ?, resolution_tx_hash = ?, resolution_hash = ?, resolved_at = ? WHERE id = ?
      `).run(input.resolution, txHash, resolutionHash, now, disputeId)
      database.prepare(`UPDATE milestones SET status = 'RESOLVED', updated_at = ? WHERE id = ?`).run(now, String(dispute.milestone_id))
    })
    completeProjectIfFinished(database, String(dispute.project_id))
    const updated = database.prepare('SELECT * FROM disputes WHERE id = ?').get(disputeId) as unknown as Record<string, unknown>
    response.json({ ...mapDispute(updated), transactionHash: txHash, chainMode: blockchain.mode })
  }))

  app.post('/api/disputes/:id/evidence', asyncRoute(async (request, response) => {
    const input = evidenceSchema.parse(request.body)
    const disputeId = String(request.params.id)
    const dispute = database.prepare('SELECT * FROM disputes WHERE id = ?').get(disputeId) as unknown as Record<string, unknown> | undefined
    if (!dispute) throw new ApiError(404, 'DISPUTE_NOT_FOUND', 'The dispute does not exist.')
    assertStatus(String(dispute.status), ['OPEN'], 'Dispute')
    const project = findProjectRow(database, String(dispute.project_id))!
    const user = request.authUser!
    if (user.wallet !== project.client_address && user.wallet !== project.freelancer_address) {
      throw new ApiError(403, 'PROJECT_ACCESS_DENIED', 'Only a project party may submit dispute evidence.')
    }
    const evidenceHash = contentHash({ evidence: input.evidence })
    const txHash = await recordAudit({
      projectId: project.id, actor: user.wallet, type: 'Dispute evidence submitted', eventName: 'EvidenceSubmitted',
      details: `Evidence added to ${disputeId}.`, transactionHash: input.transactionHash,
      verification: { contract: 'disputeManager', functions: ['submitEvidence'],
        expectedArgs: { 0: BigInt(String(dispute.chain_dispute_id ?? 0)), 1: evidenceHash } },
    })
    database.prepare(`
      INSERT INTO dispute_evidence (id, dispute_id, submitted_by, evidence_text, evidence_hash, transaction_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uniqueId('EV'), disputeId, user.wallet, input.evidence, evidenceHash, txHash, new Date().toISOString())
    response.status(201).json({ id: disputeId, evidenceHash, transactionHash: txHash, chainMode: blockchain.mode })
  }))

  app.get('/api/transactions', (request, response) => {
    const user = request.authUser!
    const projectId = typeof request.query.projectId === 'string' ? request.query.projectId : undefined
    const rows = relevantAuditRows(database, 'blockchain_transactions', user.roles.includes('ARBITRATOR'), user.wallet, projectId)
    response.json(rows.map((row) => ({
      id: row.id,
      type: row.type,
      projectId: row.project_id,
      user: row.user_address,
      amountEth: row.amount_eth ?? undefined,
      timestamp: row.timestamp,
      status: row.status,
      hash: row.tx_hash,
    })))
  })

  app.get('/api/events', (request, response) => {
    const user = request.authUser!
    const projectId = typeof request.query.projectId === 'string' ? request.query.projectId : undefined
    const rows = relevantAuditRows(database, 'chain_events', user.roles.includes('ARBITRATOR'), user.wallet, projectId)
    response.json(rows.map((row) => ({
      id: row.id,
      eventName: row.event_name,
      projectId: row.project_id,
      actor: row.actor,
      details: row.details,
      timestamp: row.timestamp,
      txHash: row.tx_hash,
    })))
  })

  app.get('/api/dashboard', (request, response) => {
    const user = request.authUser!
    const projects = listProjects(database, user)
    const allMilestones = projects.flatMap((project) => project.milestones)
    const sum = (values: string[]) => formatEther(values.reduce((total, value) => total + parseEther(value), 0n))
    const openDisputes = database.prepare(`
      SELECT COUNT(*) AS count FROM disputes d JOIN projects p ON p.id = d.project_id
      WHERE d.status = 'OPEN' AND (? = 'ARBITRATOR' OR p.client_address = ? OR p.freelancer_address = ?)
    `).get(user.roles.includes('ARBITRATOR') ? 'ARBITRATOR' : user.role, user.wallet, user.wallet) as { count: number }
    response.json({
      role: user.role,
      roles: user.roles,
      projectCount: projects.length,
      activeProjects: projects.filter((project) => project.status === 'ACTIVE').length,
      completedProjects: projects.filter((project) => project.status === 'COMPLETED').length,
      openDisputes: openDisputes.count,
      submittedMilestones: allMilestones.filter((milestone) => milestone.status === 'SUBMITTED').length,
      escrowAmountEth: sum(projects.filter((project) => project.funded && project.status !== 'COMPLETED').map((project) => project.totalAmountEth)),
      releasedAmountEth: sum(allMilestones.filter((milestone) => milestone.status === 'APPROVED').map((milestone) => milestone.amountEth)),
    })
  })

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

const mapDispute = (row: Record<string, unknown>) => ({
  id: row.id,
  projectId: row.project_id,
  milestoneId: row.milestone_id,
  raisedBy: row.raised_by_role,
  raisedByAddress: row.raised_by_address,
  description: row.description,
  status: row.status,
  createdAt: row.created_at,
  amountEth: row.amount_eth,
  resolution: row.resolution ?? undefined,
  resolutionTransactionHash: row.resolution_tx_hash ?? undefined,
  resolvedAt: row.resolved_at ?? undefined,
})

const relevantAuditRows = (
  database: AppDatabase,
  table: 'blockchain_transactions' | 'chain_events',
  isArbitrator: boolean,
  wallet: string,
  projectId?: string,
): Record<string, any>[] => {
  const projectClause = projectId ? ' AND a.project_id = ?' : ''
  const parameters = projectId ? [isArbitrator ? 1 : 0, wallet, wallet, projectId] : [isArbitrator ? 1 : 0, wallet, wallet]
  return database.prepare(`
    SELECT a.* FROM ${table} a JOIN projects p ON p.id = a.project_id
    WHERE (? = 1 OR p.client_address = ? OR p.freelancer_address = ?)
    ${projectClause}
    ORDER BY a.timestamp DESC
  `).all(...parameters) as unknown as Record<string, any>[]
}
