import type { ChainEvent, CreateProjectInput, Dispute, Project, Role, Transaction } from '../../types/domain'

export interface ProjectAdapter {
  getProjects(role: Role): Promise<Project[]>
  getProject(id: string): Promise<Project | undefined>
  createProject(input: CreateProjectInput): Promise<Project>
  getTransactions(): Promise<Transaction[]>
  getEvents(): Promise<ChainEvent[]>
  getDisputes(): Promise<Dispute[]>
  acceptProject(projectId: string): Promise<void>
  fundProject(projectId: string): Promise<void>
  createDispute(input: Omit<Dispute, 'id' | 'status' | 'createdAt'>): Promise<Dispute>
  updateMilestoneStatus(projectId: string, milestoneId: string, status: Project['milestones'][number]['status'], note?: string): Promise<void>
  resolveDispute(id: string, resolution: NonNullable<Dispute['resolution']>): Promise<void>
}
