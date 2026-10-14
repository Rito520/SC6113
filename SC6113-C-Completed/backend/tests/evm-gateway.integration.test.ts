import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { it } from 'node:test'
import { EvmBlockchainGateway } from '../src/blockchain.js'
import type { AppConfig } from '../src/config.js'

const enabled = process.env.RUN_EVM_INTEGRATION === 'true'

it('verifies a real B-contract receipt, sender, function, arguments, roles, and events', { skip: !enabled }, async () => {
  const contractsDirectory = process.env.CONTRACTS_DIRECTORY ?? path.resolve('../contracts')
  const deployment = JSON.parse(readFileSync(path.join(contractsDirectory, 'deployments/localhost.json'), 'utf8')) as any
  const transactions = JSON.parse(readFileSync(path.join(contractsDirectory, 'deployments/localhost-demo-transactions.json'), 'utf8')) as any[]
  const accepted = transactions.find((item) => item.type === 'acceptProject')
  assert.ok(accepted)

  const config: AppConfig = {
    port: 0,
    databasePath: ':memory:',
    frontendOrigin: 'http://localhost:5173',
    mockChain: false,
    authNonceTtlSeconds: 300,
    authSessionTtlSeconds: 3600,
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 31337,
    confirmations: 1,
    abiDirectory: path.join(contractsDirectory, 'deployments/abi'),
    contractAddresses: {
      roleManager: deployment.contracts.RoleManager.address,
      projectEscrow: deployment.contracts.ProjectEscrow.address,
      disputeManager: deployment.contracts.DisputeManager.address,
    },
    demoAddresses: deployment.demoAccounts,
  }
  const gateway = new EvmBlockchainGateway(config)
  assert.deepEqual(await gateway.getRoles(deployment.demoAccounts.freelancer), ['FREELANCER'])
  const receipt = await gateway.verifyAction({
    transactionHash: accepted.txHash,
    actor: deployment.demoAccounts.freelancer,
    contract: 'projectEscrow',
    functions: ['acceptProject'],
    expectedArgs: { 0: 1n },
  })
  assert.equal(receipt.functionName, 'acceptProject')
  assert.ok(receipt.events.some((event) => event.name === 'ProjectAccepted'))
})
