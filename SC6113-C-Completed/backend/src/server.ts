import { createApp } from './app.js'
import { EvmBlockchainGateway, MockBlockchainGateway } from './blockchain.js'
import { loadConfig } from './config.js'
import { createDatabase, seedDemoData } from './database.js'

const config = loadConfig()
const database = createDatabase(config.databasePath)
seedDemoData(database, config)
const blockchain = config.mockChain ? new MockBlockchainGateway() : new EvmBlockchainGateway(config)
const app = createApp({ database, config, blockchain })

const server = app.listen(config.port, () => {
  console.log(`SC6113 backend listening on http://localhost:${config.port}`)
  console.log(`Blockchain gateway: ${blockchain.mode}`)
})

const shutdown = () => {
  server.close(() => {
    database.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
