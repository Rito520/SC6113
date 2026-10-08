export type Role = 'CLIENT' | 'FREELANCER' | 'ARBITRATOR'
export type ProjectStatus = 'CREATED' | 'ACCEPTED' | 'FUNDED' | 'ACTIVE' | 'DISPUTED' | 'COMPLETED' | 'CANCELLED'
export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'REJECTED' | 'APPROVED' | 'DISPUTED' | 'RESOLVED'
export type TxStatus = 'CONFIRMED' | 'PENDING' | 'FAILED'

export interface Milestone { id: string; projectId: string; title: string; description: string; amountEth: number; dueDate: string; status: MilestoneStatus; submissionNote?: string; rejectionReason?: string }
export interface Project { id: string; title: string; description: string; clientAddress: string; clientName: string; freelancerAddress: string; freelancerName: string; totalAmountEth: number; deadline: string; status: ProjectStatus; funded: boolean; milestones: Milestone[] }
export interface Dispute { id: string; projectId: string; milestoneId: string; raisedBy: Role; description: string; status: 'OPEN' | 'RESOLVED'; createdAt: string; amountEth: number; resolution?: 'RELEASE_TO_FREELANCER' | 'REFUND_TO_CLIENT' }
export interface Transaction { id: string; type: string; projectId: string; user: string; amountEth?: number; timestamp: string; status: TxStatus; hash: string }
export interface ChainEvent { id: string; eventName: string; projectId: string; actor: string; details: string; timestamp: string; txHash: string }
export interface DashboardMetrics { label: string; value: string | number; detail?: string }
export interface CreateProjectInput { title: string; description: string; freelancerAddress: string; totalAmountEth: number; deadline: string; milestones: Omit<Milestone, 'id' | 'projectId' | 'status'>[] }
