import { parseEther } from 'ethers'
import { z } from 'zod'

export const walletSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'A valid Ethereum address is required.')
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
export const ethAmountSchema = z.string().refine((value) => {
  try {
    return parseEther(value) > 0n
  } catch {
    return false
  }
}, 'Use a positive ETH decimal string with no more than 18 decimal places.')

export const projectCreateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(5).max(5_000),
  freelancerAddress: walletSchema,
  totalAmountEth: ethAmountSchema,
  deadline: dateSchema,
  chainProjectId: z.string().trim().max(120).optional(),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  milestones: z.array(z.object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().min(2).max(2_000),
    amountEth: ethAmountSchema,
    dueDate: dateSchema,
    chainMilestoneId: z.string().trim().max(120).optional(),
  })).min(1).max(20),
})

export const submissionSchema = z.object({
  note: z.string().trim().min(1).max(4_000),
  evidenceUrl: z.string().url().max(2_000).optional(),
  evidenceHash: z.string().trim().max(256).optional(),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
})

export const rejectionSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
})

export const disputeSchema = z.object({
  projectId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  description: z.string().trim().min(2).max(4_000),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
})

export const resolutionSchema = z.object({
  resolution: z.enum(['RELEASE_TO_FREELANCER', 'REFUND_TO_CLIENT']),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
})

export const transactionSchema = z.object({
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
})

export const evidenceSchema = z.object({
  evidence: z.string().trim().min(1).max(4_000),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
})
