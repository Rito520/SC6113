const { spawnSync } = require('node:child_process')

const command = process.argv[2] || 'test'
const cli = require.resolve('hardhat/internal/cli/cli.js')
const result = spawnSync(process.execPath, [cli, command], {
  env: { ...process.env, USE_LOCAL_SOLC: process.env.USE_LOCAL_SOLC || 'true' },
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
