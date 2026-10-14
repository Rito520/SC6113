import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getAddress } from 'ethers'
import type { AppConfig } from './config.js'
import type { Role } from './types.js'

export type AppDatabase = DatabaseSync

export const inTransaction = <T>(database: AppDatabase, operation: () => T): T => {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

const normalizeAddress = (address: string): string => getAddress(address).toLowerCase()

export const createDatabase = (filename: string): AppDatabase => {
  if (filename !== ':memory:') mkdirSync(path.dirname(path.resolve(filename)), { recursive: true })
  const database = new DatabaseSync(filename)
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
  migrate(database)
  return database
}

const migrate = (database: AppDatabase): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      wallet_address TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('CLIENT','FREELANCER','ARBITRATOR')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_nonces (
      wallet_address TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      message TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('CLIENT','FREELANCER','ARBITRATOR')),
      source TEXT NOT NULL DEFAULT 'LOCAL',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (wallet_address, role)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      chain_project_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      client_address TEXT NOT NULL REFERENCES users(wallet_address),
      freelancer_address TEXT NOT NULL REFERENCES users(wallet_address),
      total_amount_eth TEXT NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL,
      funded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      chain_milestone_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_eth TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL,
      submission_note TEXT,
      rejection_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      submitted_by TEXT NOT NULL REFERENCES users(wallet_address),
      note TEXT NOT NULL,
      evidence_url TEXT,
      evidence_hash TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rejections (
      id TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      rejected_by TEXT NOT NULL REFERENCES users(wallet_address),
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      milestone_id TEXT NOT NULL REFERENCES milestones(id),
      raised_by_role TEXT NOT NULL,
      raised_by_address TEXT NOT NULL REFERENCES users(wallet_address),
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      amount_eth TEXT NOT NULL,
      resolution TEXT,
      resolution_tx_hash TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS dispute_evidence (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
      submitted_by TEXT NOT NULL REFERENCES users(wallet_address),
      evidence_text TEXT NOT NULL,
      evidence_hash TEXT NOT NULL,
      transaction_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blockchain_transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_address TEXT NOT NULL,
      amount_eth TEXT,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      tx_hash TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS chain_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id),
      actor TEXT NOT NULL,
      details TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      block_number INTEGER,
      log_index INTEGER,
      UNIQUE(tx_hash, log_index)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_address);
    CREATE INDEX IF NOT EXISTS idx_projects_freelancer ON projects(freelancer_address);
    CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
    CREATE INDEX IF NOT EXISTS idx_disputes_project ON disputes(project_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_project ON blockchain_transactions(project_id);
    CREATE INDEX IF NOT EXISTS idx_events_project ON chain_events(project_id);
    CREATE INDEX IF NOT EXISTS idx_user_roles_wallet ON user_roles(wallet_address);
  `)

  const ensureColumn = (table: string, column: string, definition: string): void => {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>
    if (!columns.some((item) => item.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
  ensureColumn('projects', 'chain_id', 'INTEGER')
  ensureColumn('projects', 'amount_wei', 'TEXT')
  ensureColumn('projects', 'metadata_hash', 'TEXT')
  ensureColumn('milestones', 'amount_wei', 'TEXT')
  ensureColumn('milestones', 'metadata_hash', 'TEXT')
  ensureColumn('submissions', 'transaction_hash', 'TEXT')
  ensureColumn('rejections', 'reason_hash', 'TEXT')
  ensureColumn('rejections', 'transaction_hash', 'TEXT')
  ensureColumn('disputes', 'chain_dispute_id', 'TEXT')
  ensureColumn('disputes', 'reason_hash', 'TEXT')
  ensureColumn('disputes', 'resolution_hash', 'TEXT')
  ensureColumn('blockchain_transactions', 'chain_id', 'INTEGER')
  ensureColumn('blockchain_transactions', 'block_number', 'INTEGER')
  ensureColumn('blockchain_transactions', 'transaction_index', 'INTEGER')
  ensureColumn('blockchain_transactions', 'contract_address', 'TEXT')
  ensureColumn('blockchain_transactions', 'function_name', 'TEXT')
  ensureColumn('chain_events', 'transaction_index', 'INTEGER')
  ensureColumn('chain_events', 'contract_address', 'TEXT')
  ensureColumn('chain_events', 'block_hash', 'TEXT')
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_chain_identity
      ON projects(chain_id, chain_project_id) WHERE chain_project_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_milestones_chain_identity
      ON milestones(project_id, chain_milestone_id) WHERE chain_milestone_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_disputes_chain_identity
      ON disputes(chain_dispute_id) WHERE chain_dispute_id IS NOT NULL;
  `)
}

export const upsertUser = (
  database: AppDatabase,
  address: string,
  displayName: string,
  role: Role,
): void => {
  database.prepare(`
    INSERT INTO users (wallet_address, display_name, role, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET display_name = excluded.display_name, role = excluded.role
  `).run(normalizeAddress(address), displayName, role, new Date().toISOString())
  upsertUserRoles(database, address, [role], 'LOCAL')
}

export const upsertUserRoles = (
  database: AppDatabase,
  address: string,
  roles: Role[],
  source: 'LOCAL' | 'CHAIN' = 'CHAIN',
): void => {
  const wallet = normalizeAddress(address)
  if (roles.length === 0) return
  const now = new Date().toISOString()
  const existing = database.prepare('SELECT display_name FROM users WHERE wallet_address = ?').get(wallet) as { display_name: string } | undefined
  const primary = roles[0]!
  database.prepare(`
    INSERT INTO users (wallet_address, display_name, role, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET role = excluded.role
  `).run(wallet, existing?.display_name ?? `Wallet ${wallet.slice(0, 8)}`, primary, now)
  if (source === 'CHAIN') database.prepare(`DELETE FROM user_roles WHERE wallet_address = ? AND source = 'CHAIN'`).run(wallet)
  const insert = database.prepare(`
    INSERT INTO user_roles (wallet_address, role, source, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(wallet_address, role) DO UPDATE SET source = excluded.source, updated_at = excluded.updated_at
  `)
  for (const role of roles) insert.run(wallet, role, source, now)
}

export const getUserRoles = (database: AppDatabase, address: string): Role[] => {
  const wallet = normalizeAddress(address)
  const rows = database.prepare('SELECT role FROM user_roles WHERE wallet_address = ? ORDER BY role').all(wallet) as unknown as Array<{ role: Role }>
  if (rows.length > 0) return rows.map((row) => row.role)
  const legacy = database.prepare('SELECT role FROM users WHERE wallet_address = ?').get(wallet) as { role: Role } | undefined
  return legacy ? [legacy.role] : []
}

export const seedDemoData = (database: AppDatabase, config: AppConfig): void => {
  const client = normalizeAddress(config.demoAddresses.client)
  const freelancer = normalizeAddress(config.demoAddresses.freelancer)
  const arbitrator = normalizeAddress(config.demoAddresses.arbitrator)
  upsertUser(database, client, 'Ava Client', 'CLIENT')
  upsertUser(database, freelancer, 'Noah Freelancer', 'FREELANCER')
  upsertUser(database, arbitrator, 'Morgan Arbitrator', 'ARBITRATOR')

  const count = database.prepare('SELECT COUNT(*) AS count FROM projects').get() as { count: number }
  if (count.count > 0) return

  const now = new Date().toISOString()
  database.prepare(`
    INSERT INTO projects (id, title, description, client_address, freelancer_address, total_amount_eth, deadline, status, funded, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('P-1001', 'E-commerce product site', 'Three-stage implementation for a small online store.', client, freelancer, '4.5', '2026-11-30', 'ACTIVE', 1, now, now)

  const milestone = database.prepare(`
    INSERT INTO milestones (id, project_id, title, description, amount_eth, due_date, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  milestone.run('M-101', 'P-1001', 'Design system', 'Deliver approved design tokens and screens.', '1.5', '2026-10-18', 'SUBMITTED', now, now)
  milestone.run('M-102', 'P-1001', 'Storefront implementation', 'Build catalogue, cart, and checkout views.', '2', '2026-11-08', 'IN_PROGRESS', now, now)
  milestone.run('M-103', 'P-1001', 'QA handover', 'Fix acceptance issues and provide handover notes.', '1', '2026-11-30', 'PENDING', now, now)
}
