export type Role = 'CLIENT' | 'FREELANCER' | 'ARBITRATOR'
export type ProjectStatus = 'CREATED' | 'ACCEPTED' | 'FUNDED' | 'ACTIVE' | 'DISPUTED' | 'COMPLETED' | 'CANCELLED'
export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'REJECTED' | 'APPROVED' | 'DISPUTED' | 'RESOLVED'
export type TransactionStatus = 'CONFIRMED' | 'PENDING' | 'FAILED'

export interface AuthUser {
  wallet: string
  role: Role
  roles: Role[]
  displayName: string
}

declare global {
  namespace Express {
    interface Request { authUser?: AuthUser }
  }
}
