import { randomUUID } from 'node:crypto'
import { formatEther, parseEther } from 'ethers'
import type { AppDatabase } from './database.js'
import { ApiError } from './errors.js'
import type { AuthUser, MilestoneStatus, ProjectStatus, Role } from './types.js'

interface ProjectRow {
  id: string
  chain_project_id: string | null
  title: string
  description: string
  client_address: string
  client_name: string
  freelancer_address: string
  freelancer_name: string
  total_amount_eth: string
  deadline: string
  status: ProjectStatus
  funded: number
  created_at: string
  updated_at: string
}

interface MilestoneRow {
  id: string
  project_id: string
  chain_milestone_id: string | null
  title: string
  description: string
  amount_eth: string
  due_date: string
  status: MilestoneStatus
  submission_note: string | null
  rejection_reason: string | null
}

const projectSelect = `
  SELECT p.*, cu.display_name AS client_name, fu.display_name AS freelancer_name
  FROM projects p
  JOIN users cu ON cu.wallet_address = p.client_address
  JOIN users fu ON fu.wallet_address = p.freelancer_address
`

const mapMilestone = (row: MilestoneRow) => ({
  id: row.id,
  projectId: row.project_id,
  chainMilestoneId: row.chain_milestone_id ?? undefined,
  title: row.title,
  description: row.description,
  amountEth: row.amount_eth,
  dueDate: row.due_date,
  status: row.status,
  submissionNote: row.submission_note ?? undefined,
  rejectionReason: row.rejection_reason ?? undefined,
})

const mapProject = (database: AppDatabase, row: ProjectRow) => {
  const milestones = database.prepare(`
    SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at, id
  `).all(row.id) as unknown as MilestoneRow[]
  return {
    id: row.id,
    chainProjectId: row.chain_project_id ?? undefined,
    title: row.title,
    description: row.description,
    clientAddress: row.client_address,
    clientName: row.client_name,
    freelancerAddress: row.freelancer_address,
    freelancerName: row.freelancer_name,
    totalAmountEth: row.total_amount_eth,
    deadline: row.deadline,
    status: row.status,
    funded: Boolean(row.funded),
    milestones: milestones.map(mapMilestone),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const findProjectRow = (database: AppDatabase, id: string): ProjectRow | undefined =>
  database.prepare(`${projectSelect} WHERE p.id = ?`).get(id) as unknown as ProjectRow | undefined

export const getProject = (database: AppDatabase, id: string) => {
  const row = findProjectRow(database, id)
  return row ? mapProject(database, row) : undefined
}

export const assertProjectAccess = (database: AppDatabase, project: ProjectRow, user: AuthUser): void => {
  if (user.roles.includes('CLIENT') && project.client_address === user.wallet) return
  if (user.roles.includes('FREELANCER') && project.freelancer_address === user.wallet) return
  if (user.roles.includes('ARBITRATOR')) {
    const dispute = database.prepare('SELECT 1 FROM disputes WHERE project_id = ? LIMIT 1').get(project.id)
    if (dispute) return
  }
  throw new ApiError(403, 'PROJECT_ACCESS_DENIED', 'This project is not associated with the authenticated wallet.')
}

export const listProjects = (database: AppDatabase, user: AuthUser) => {
  const rows = database.prepare(`${projectSelect}
    WHERE p.client_address = ? OR p.freelancer_address = ?
      OR (? = 1 AND EXISTS (SELECT 1 FROM disputes d WHERE d.project_id = p.id))
    ORDER BY p.updated_at DESC
  `).all(user.wallet, user.wallet, user.roles.includes('ARBITRATOR') ? 1 : 0) as unknown as ProjectRow[]
  return rows.map((row) => mapProject(database, row))
}

export const findMilestone = (database: AppDatabase, id: string): MilestoneRow => {
  const row = database.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as unknown as MilestoneRow | undefined
  if (!row) throw new ApiError(404, 'MILESTONE_NOT_FOUND', 'The milestone does not exist.')
  return row
}

export const uniqueId = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`

export const assertRole = (user: AuthUser, role: Role): void => {
  if (!user.roles.includes(role)) throw new ApiError(403, 'FORBIDDEN_ROLE', `This action requires the ${role} role.`)
}

export const assertStatus = <T extends string>(actual: T, expected: T[], resource: string): void => {
  if (!expected.includes(actual)) {
    throw new ApiError(409, 'INVALID_STATE_TRANSITION', `${resource} is ${actual}; expected ${expected.join(' or ')}.`)
  }
}

export const sumEth = (amounts: string[]): string => formatEther(amounts.reduce((sum, value) => sum + parseEther(value), 0n))

export const completeProjectIfFinished = (database: AppDatabase, projectId: string): void => {
  const row = database.prepare(`
    SELECT COUNT(*) AS remaining FROM milestones
    WHERE project_id = ? AND status NOT IN ('APPROVED', 'RESOLVED')
  `).get(projectId) as { remaining: number }
  database.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(
    row.remaining === 0 ? 'COMPLETED' : 'ACTIVE',
    new Date().toISOString(),
    projectId,
  )
}

export const amountTotal = (values: string[]): string => formatEther(values.reduce((sum, value) => sum + parseEther(value), 0n))
