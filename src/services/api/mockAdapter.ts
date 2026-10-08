import { disputes, events, projects, transactions } from '../../mocks/data'
import type { ProjectAdapter } from './projectAdapter'
import type { CreateProjectInput, Dispute, Project, Role } from '../../types/domain'

const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 250))
export const mockAdapter: ProjectAdapter = {
  async getProjects(_role: Role) { await delay(); return projects },
  async getProject(id) { await delay(); return projects.find((p) => p.id === id) },
  async createProject(input: CreateProjectInput) {
    await delay(); const id = `P-${1000 + projects.length + 1}`
    const project: Project = { id, ...input, clientAddress: '0xC1aE...a123', clientName: 'You (Client)', freelancerName: 'Assigned freelancer', status: 'CREATED', funded: false, milestones: input.milestones.map((m, i) => ({ ...m, id: `M-${id}-${i + 1}`, projectId: id, status: 'PENDING' })) }
    projects.unshift(project); return project
  },
  async getTransactions() { await delay(); return transactions },
  async getEvents() { await delay(); return events },
  async getDisputes() { await delay(); return disputes },
  async acceptProject(projectId) { await delay(); const project = projects.find((p) => p.id === projectId); if (project?.status === 'CREATED') project.status = 'ACCEPTED' },
  async fundProject(projectId) { await delay(); const project = projects.find((p) => p.id === projectId); if (project && project.status === 'ACCEPTED') { project.funded = true; project.status = 'ACTIVE'; project.milestones.forEach((m) => { if (m.status === 'PENDING') m.status = 'IN_PROGRESS' }) } },
  async createDispute(input) { await delay(); const dispute: Dispute = { ...input, id: `D-${String(disputes.length + 1).padStart(2, '0')}`, status: 'OPEN', createdAt: new Date().toISOString() }; disputes.unshift(dispute); const project = projects.find((p) => p.id === input.projectId); if (project) { project.status = 'DISPUTED'; const milestone = project.milestones.find((m) => m.id === input.milestoneId); if (milestone) milestone.status = 'DISPUTED' } return dispute },
  async updateMilestoneStatus(projectId, milestoneId, status, note) {
    await delay(); const milestone = projects.find((p) => p.id === projectId)?.milestones.find((m) => m.id === milestoneId)
    if (milestone) { milestone.status = status; if (status === 'SUBMITTED') milestone.submissionNote = note; if (status === 'REJECTED') milestone.rejectionReason = note }
  },
  async resolveDispute(id, resolution) { await delay(); const dispute = disputes.find((d) => d.id === id); if (dispute) { dispute.status = 'RESOLVED'; dispute.resolution = resolution } },
}
