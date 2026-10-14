import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Contract, Interface, JsonRpcProvider, getAddress, type InterfaceAbi, type Log, type TransactionReceipt } from 'ethers'
import type { AppConfig } from './config.js'
import { ApiError } from './errors.js'
import type { Role } from './types.js'

export type ContractName = 'roleManager' | 'projectEscrow' | 'disputeManager'

export interface ChainEvent {
  name: string
  address: string
  args: Record<string, string | boolean>
  blockNumber: number
  transactionIndex: number
  logIndex: number
}

export interface ChainReceipt {
  transactionHash: string
  status: 'CONFIRMED'
  blockNumber?: number
  transactionIndex?: number
  from?: string
  to?: string
  functionName?: string
  events: ChainEvent[]
}

export interface VerifyActionRequest {
  transactionHash?: string
  actor: string
  contract: ContractName
  functions: string[]
  expectedArgs?: Record<number, string | bigint | boolean>
  expectedValueWei?: bigint
}

export interface BlockchainGateway {
  readonly mode: 'mock' | 'evm'
  verifyAction(request: VerifyActionRequest): Promise<ChainReceipt>
  getRoles(wallet: string): Promise<Role[]>
}

export class MockBlockchainGateway implements BlockchainGateway {
  readonly mode = 'mock' as const

  async verifyAction(_request: VerifyActionRequest): Promise<ChainReceipt> {
    return { transactionHash: `0x${randomBytes(32).toString('hex')}`, status: 'CONFIRMED', events: [] }
  }

  async getRoles(): Promise<Role[]> { return [] }
}

const normalizeComparable = (value: unknown): string => {
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)) return getAddress(value).toLowerCase()
  return String(value).toLowerCase()
}

const loadAbi = (directory: string, contractName: string): InterfaceAbi => {
  const parsed = JSON.parse(readFileSync(path.join(directory, `${contractName}.json`), 'utf8')) as unknown
  if (!Array.isArray(parsed)) throw new Error(`${contractName}.json must contain an ABI array.`)
  return parsed as InterfaceAbi
}

export class EvmBlockchainGateway implements BlockchainGateway {
  readonly mode = 'evm' as const
  private readonly provider: JsonRpcProvider
  private readonly interfaces: Record<ContractName, Interface>

  constructor(private readonly config: AppConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true })
    this.interfaces = {
      roleManager: new Interface(loadAbi(config.abiDirectory, 'RoleManager')),
      projectEscrow: new Interface(loadAbi(config.abiDirectory, 'ProjectEscrow')),
      disputeManager: new Interface(loadAbi(config.abiDirectory, 'DisputeManager')),
    }
  }

  async getRoles(wallet: string): Promise<Role[]> {
    await this.assertNetwork()
    const contract = new Contract(this.config.contractAddresses.roleManager, this.interfaces.roleManager, this.provider)
    const result = await contract.getFunction('rolesOf')(wallet) as [boolean, boolean, boolean, boolean]
    const roles: Role[] = []
    if (result[1]) roles.push('CLIENT')
    if (result[2]) roles.push('FREELANCER')
    if (result[3]) roles.push('ARBITRATOR')
    return roles
  }

  async verifyAction(request: VerifyActionRequest): Promise<ChainReceipt> {
    if (!request.transactionHash) {
      throw new ApiError(400, 'TRANSACTION_HASH_REQUIRED', 'EVM mode requires the MetaMask transaction hash.')
    }
    await this.assertNetwork()
    const [transaction, receipt] = await Promise.all([
      this.provider.getTransaction(request.transactionHash),
      this.provider.getTransactionReceipt(request.transactionHash),
    ])
    if (!transaction || !receipt) throw new ApiError(409, 'TRANSACTION_NOT_MINED', 'The transaction is not mined yet.')
    if (receipt.status !== 1) throw new ApiError(422, 'TRANSACTION_REVERTED', 'The on-chain transaction reverted.')
    const confirmations = (await this.provider.getBlockNumber()) - receipt.blockNumber + 1
    if (confirmations < this.config.confirmations) {
      throw new ApiError(409, 'INSUFFICIENT_CONFIRMATIONS', `${this.config.confirmations} confirmation(s) required.`)
    }

    const expectedAddress = getAddress(this.config.contractAddresses[request.contract]).toLowerCase()
    if (!transaction.to || getAddress(transaction.to).toLowerCase() !== expectedAddress) {
      throw new ApiError(422, 'WRONG_CONTRACT', `The transaction was not sent to ${request.contract}.`)
    }
    if (getAddress(transaction.from).toLowerCase() !== getAddress(request.actor).toLowerCase()) {
      throw new ApiError(422, 'WRONG_TRANSACTION_SENDER', 'The transaction sender does not match the authenticated wallet.')
    }
    const parsed = this.interfaces[request.contract].parseTransaction({ data: transaction.data, value: transaction.value })
    if (!parsed || !request.functions.includes(parsed.name)) {
      throw new ApiError(422, 'WRONG_CONTRACT_FUNCTION', `Expected ${request.functions.join(' or ')}.`)
    }
    for (const [indexText, expected] of Object.entries(request.expectedArgs ?? {})) {
      const index = Number(indexText)
      if (normalizeComparable(parsed.args[index]) !== normalizeComparable(expected)) {
        throw new ApiError(422, 'TRANSACTION_ARGUMENT_MISMATCH', `Argument ${index} does not match the REST request.`)
      }
    }
    if (request.expectedValueWei !== undefined && transaction.value !== request.expectedValueWei) {
      throw new ApiError(422, 'TRANSACTION_VALUE_MISMATCH', 'The transaction value does not match the project amount.')
    }
    return this.toChainReceipt(receipt, parsed.name)
  }

  private async assertNetwork(): Promise<void> {
    const network = await this.provider.getNetwork()
    if (Number(network.chainId) !== this.config.chainId) {
      throw new ApiError(503, 'WRONG_CHAIN', `RPC chain ${network.chainId} does not match configured chain ${this.config.chainId}.`)
    }
  }

  private toChainReceipt(receipt: TransactionReceipt, functionName: string): ChainReceipt {
    const events = receipt.logs.flatMap((log) => {
      const parsed = this.parseLog(log)
      return parsed ? [parsed] : []
    })
    return {
      transactionHash: receipt.hash,
      status: 'CONFIRMED',
      blockNumber: receipt.blockNumber,
      transactionIndex: receipt.index,
      from: receipt.from.toLowerCase(),
      to: receipt.to?.toLowerCase(),
      functionName,
      events,
    }
  }

  private parseLog(log: Log): ChainEvent | undefined {
    for (const contractName of Object.keys(this.interfaces) as ContractName[]) {
      try {
        const parsed = this.interfaces[contractName].parseLog({ topics: [...log.topics], data: log.data })
        if (!parsed) continue
        const args: Record<string, string | boolean> = {}
        parsed.fragment.inputs.forEach((input, index) => {
          const value = parsed.args[index]
          args[input.name || String(index)] = typeof value === 'bigint' ? value.toString() : value
        })
        return {
          name: parsed.name,
          address: log.address.toLowerCase(),
          args,
          blockNumber: log.blockNumber,
          transactionIndex: log.transactionIndex,
          logIndex: log.index,
        }
      } catch { /* log from an unrelated contract */ }
    }
    return undefined
  }
}
