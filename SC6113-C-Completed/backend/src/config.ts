import 'dotenv/config'
import path from 'node:path'

const integer = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export interface ContractAddresses {
  roleManager: string
  projectEscrow: string
  disputeManager: string
}

export interface AppConfig {
  port: number
  databasePath: string
  frontendOrigin: string
  mockChain: boolean
  authNonceTtlSeconds: number
  authSessionTtlSeconds: number
  rpcUrl: string
  chainId: number
  confirmations: number
  abiDirectory: string
  contractAddresses: ContractAddresses
  demoAddresses: { client: string; freelancer: string; arbitrator: string }
}

export const loadConfig = (): AppConfig => ({
  port: integer(process.env.PORT, 3001),
  databasePath: process.env.DATABASE_PATH ?? path.resolve('data/sc6113.db'),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  mockChain: (process.env.CHAIN_MODE ?? (process.env.MOCK_CHAIN === 'false' ? 'evm' : 'mock')).toLowerCase() !== 'evm',
  authNonceTtlSeconds: integer(process.env.AUTH_NONCE_TTL_SECONDS, 300),
  authSessionTtlSeconds: integer(process.env.AUTH_SESSION_TTL_SECONDS, 28_800),
  rpcUrl: process.env.RPC_URL ?? 'http://127.0.0.1:8545',
  chainId: integer(process.env.CHAIN_ID, 31_337),
  confirmations: integer(process.env.CHAIN_CONFIRMATIONS, 1),
  abiDirectory: process.env.CONTRACT_ABI_DIRECTORY ?? path.resolve('../contracts/deployments/abi'),
  contractAddresses: {
    roleManager: process.env.ROLE_MANAGER_ADDRESS ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    projectEscrow: process.env.PROJECT_ESCROW_ADDRESS ?? '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    disputeManager: process.env.DISPUTE_MANAGER_ADDRESS ?? '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  },
  demoAddresses: {
    client: process.env.DEMO_CLIENT_ADDRESS ?? '0x1111111111111111111111111111111111111111',
    freelancer: process.env.DEMO_FREELANCER_ADDRESS ?? '0x2222222222222222222222222222222222222222',
    arbitrator: process.env.DEMO_ARBITRATOR_ADDRESS ?? '0x3333333333333333333333333333333333333333',
  },
})
