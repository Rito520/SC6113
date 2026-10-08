import type { ChainEvent, Dispute, Project, Role, Transaction } from '../types/domain'

export const demoAddresses: Record<Role, string> = { CLIENT: '0xC1aE...a123', FREELANCER: '0xFRee...b456', ARBITRATOR: '0xArb1...c789' }

export const projects: Project[] = [
  { id: 'P-1001', title: 'E-commerce product site', description: 'Three-stage frontend implementation for a small online store.', clientAddress: demoAddresses.CLIENT, clientName: 'Ava Client', freelancerAddress: demoAddresses.FREELANCER, freelancerName: 'Noah Freelancer', totalAmountEth: 4.5, deadline: '2026-11-30', status: 'ACTIVE', funded: true, milestones: [
    { id: 'M-101', projectId: 'P-1001', title: 'Design system', description: 'Deliver approved design tokens and screens.', amountEth: 1.5, dueDate: '2026-10-18', status: 'SUBMITTED', submissionNote: 'Figma link and component notes attached.' },
    { id: 'M-102', projectId: 'P-1001', title: 'Storefront implementation', description: 'Build catalogue, cart, and checkout views.', amountEth: 2, dueDate: '2026-11-08', status: 'IN_PROGRESS' },
    { id: 'M-103', projectId: 'P-1001', title: 'QA handover', description: 'Fix acceptance issues and provide handover notes.', amountEth: 1, dueDate: '2026-11-30', status: 'PENDING' },
  ] },
  { id: 'P-1002', title: 'Analytics dashboard', description: 'Internal dashboard visualising monthly subscription metrics.', clientAddress: demoAddresses.CLIENT, clientName: 'Ava Client', freelancerAddress: demoAddresses.FREELANCER, freelancerName: 'Noah Freelancer', totalAmountEth: 3, deadline: '2026-10-22', status: 'DISPUTED', funded: true, milestones: [
    { id: 'M-201', projectId: 'P-1002', title: 'Metrics views', description: 'Implement agreed metric and filter screens.', amountEth: 3, dueDate: '2026-10-10', status: 'DISPUTED', rejectionReason: 'The submission does not yet include the retention chart.' },
  ] },
  { id: 'P-1003', title: 'Portfolio refresh', description: 'Update personal portfolio content and responsive styling.', clientAddress: demoAddresses.CLIENT, clientName: 'Ava Client', freelancerAddress: demoAddresses.FREELANCER, freelancerName: 'Noah Freelancer', totalAmountEth: 1.2, deadline: '2026-09-20', status: 'COMPLETED', funded: true, milestones: [
    { id: 'M-301', projectId: 'P-1003', title: 'Complete delivery', description: 'Approved final portfolio build.', amountEth: 1.2, dueDate: '2026-09-20', status: 'APPROVED' },
  ] },
]

export const disputes: Dispute[] = [{ id: 'D-01', projectId: 'P-1002', milestoneId: 'M-201', raisedBy: 'FREELANCER', description: 'The requested chart was not in the agreed milestone scope. Please review the submitted work and original requirement.', status: 'OPEN', createdAt: '2026-10-07T09:45:00Z', amountEth: 3 }]

export const transactions: Transaction[] = [
  { id: 'T-01', type: 'Escrow funded', projectId: 'P-1001', user: 'Ava Client', amountEth: 4.5, timestamp: '2026-10-02T08:12:00Z', status: 'CONFIRMED', hash: '0x9a1f...4d82' },
  { id: 'T-02', type: 'Milestone submitted', projectId: 'P-1001', user: 'Noah Freelancer', timestamp: '2026-10-06T14:20:00Z', status: 'CONFIRMED', hash: '0x7b2e...1f10' },
  { id: 'T-03', type: 'Dispute opened', projectId: 'P-1002', user: 'Noah Freelancer', amountEth: 3, timestamp: '2026-10-07T09:45:00Z', status: 'CONFIRMED', hash: '0xcd21...8aa4' },
  { id: 'T-04', type: 'Payment released', projectId: 'P-1003', user: 'Escrow contract', amountEth: 1.2, timestamp: '2026-09-19T12:32:00Z', status: 'CONFIRMED', hash: '0xafe3...73c9' },
]

export const events: ChainEvent[] = [
  { id: 'E-01', eventName: 'ProjectFunded', projectId: 'P-1001', actor: '0xC1aE...a123', details: '4.5 ETH deposited into escrow.', timestamp: '2026-10-02T08:12:00Z', txHash: '0x9a1f...4d82' },
  { id: 'E-02', eventName: 'MilestoneSubmitted', projectId: 'P-1001', actor: '0xFRee...b456', details: 'M-101 submitted for client review.', timestamp: '2026-10-06T14:20:00Z', txHash: '0x7b2e...1f10' },
  { id: 'E-03', eventName: 'DisputeRaised', projectId: 'P-1002', actor: '0xFRee...b456', details: 'D-01 opened for milestone M-201.', timestamp: '2026-10-07T09:45:00Z', txHash: '0xcd21...8aa4' },
  { id: 'E-04', eventName: 'PaymentReleased', projectId: 'P-1003', actor: 'Escrow contract', details: '1.2 ETH released to freelancer.', timestamp: '2026-09-19T12:32:00Z', txHash: '0xafe3...73c9' },
]
