import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { Wallet } from 'ethers'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { MockBlockchainGateway } from '../src/blockchain.js'
import type { AppConfig } from '../src/config.js'
import { createDatabase, upsertUser, type AppDatabase } from '../src/database.js'

describe('C backend end-to-end API', () => {
  let database: AppDatabase
  let app: ReturnType<typeof createApp>
  const client = Wallet.createRandom()
  const freelancer = Wallet.createRandom()
  const arbitrator = Wallet.createRandom()
  const config: AppConfig = {
    port: 0,
    databasePath: ':memory:',
    frontendOrigin: 'http://localhost:5173',
    mockChain: true,
    authNonceTtlSeconds: 300,
    authSessionTtlSeconds: 3600,
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 31337,
    confirmations: 1,
    abiDirectory: '../contracts/deployments/abi',
    contractAddresses: {
      roleManager: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      projectEscrow: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      disputeManager: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    },
    demoAddresses: { client: client.address, freelancer: freelancer.address, arbitrator: arbitrator.address },
  }

  before(() => {
    database = createDatabase(':memory:')
    upsertUser(database, client.address, 'Test Client', 'CLIENT')
    upsertUser(database, freelancer.address, 'Test Freelancer', 'FREELANCER')
    upsertUser(database, arbitrator.address, 'Test Arbitrator', 'ARBITRATOR')
    app = createApp({ database, config, blockchain: new MockBlockchainGateway() })
  })

  after(() => database.close())

  const authenticate = async (wallet: { address: string; signMessage(message: string): Promise<string> }): Promise<string> => {
    const nonce = await request(app).post('/api/auth/nonce').send({ wallet: wallet.address }).expect(200)
    const signature = await wallet.signMessage(nonce.body.message)
    const verified = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature }).expect(200)
    return verified.body.token as string
  }

  it('runs create, accept, fund, submit, reject, dispute, and resolution flows', async () => {
    const clientToken = await authenticate(client)
    const freelancerToken = await authenticate(freelancer)
    const arbitratorToken = await authenticate(arbitrator)

    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        title: 'API test project',
        description: 'End-to-end project created by the integration test.',
        freelancerAddress: freelancer.address,
        totalAmountEth: '1.25',
        deadline: '2099-12-31',
        milestones: [{ title: 'Delivery', description: 'Complete the agreed delivery.', amountEth: '1.25', dueDate: '2099-12-01' }],
      })
      .expect(201)

    assert.equal(created.body.totalAmountEth, '1.25')
    assert.equal(created.body.status, 'CREATED')
    const projectId = created.body.id as string
    const milestoneId = created.body.milestones[0].id as string

    await request(app).post(`/api/projects/${projectId}/accept`).set('Authorization', `Bearer ${freelancerToken}`).expect(200)
    const funded = await request(app).post(`/api/projects/${projectId}/fund`).set('Authorization', `Bearer ${clientToken}`).expect(200)
    assert.equal(funded.body.project.status, 'ACTIVE')
    assert.equal(funded.body.chainMode, 'mock')

    await request(app)
      .post(`/api/milestones/${milestoneId}/submissions`)
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ note: 'Evidence uploaded.', evidenceUrl: 'https://example.com/evidence' })
      .expect(201)

    await request(app)
      .post(`/api/milestones/${milestoneId}/rejections`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ reason: 'Please include the acceptance notes.' })
      .expect(200)

    const disputed = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ projectId, milestoneId, description: 'The original scope has been completed.' })
      .expect(201)

    const resolved = await request(app)
      .post(`/api/disputes/${disputed.body.id}/resolution-record`)
      .set('Authorization', `Bearer ${arbitratorToken}`)
      .send({ resolution: 'RELEASE_TO_FREELANCER' })
      .expect(200)
    assert.equal(resolved.body.status, 'RESOLVED')

    const transactions = await request(app).get('/api/transactions').set('Authorization', `Bearer ${clientToken}`).expect(200)
    assert.equal(transactions.body.length, 7)
    assert.ok(transactions.body.every((item: { hash: string }) => /^0x[a-f0-9]{64}$/.test(item.hash)))
  })

  it('rejects milestone totals that do not match the project total', async () => {
    const token = await authenticate(client)
    const response = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Invalid total', description: 'This request must fail.', freelancerAddress: freelancer.address,
        totalAmountEth: '2', deadline: '2099-12-31',
        milestones: [{ title: 'Only milestone', description: 'Does not match.', amountEth: '1', dueDate: '2099-12-01' }],
      })
      .expect(400)
    assert.equal(response.body.error.code, 'MILESTONE_TOTAL_MISMATCH')
  })
})
