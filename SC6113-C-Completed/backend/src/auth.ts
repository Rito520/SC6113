import { createHash, randomBytes } from 'node:crypto'
import type { RequestHandler } from 'express'
import { getAddress, verifyMessage } from 'ethers'
import type { AppConfig } from './config.js'
import { getUserRoles, inTransaction, type AppDatabase } from './database.js'
import { ApiError } from './errors.js'
import type { AuthUser, Role } from './types.js'

interface UserRow {
  wallet_address: string
  display_name: string
  role: Role
  roles?: Role[]
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

export const normalizeWallet = (wallet: string): string => {
  try {
    return getAddress(wallet).toLowerCase()
  } catch {
    throw new ApiError(400, 'INVALID_WALLET', 'A valid Ethereum wallet address is required.')
  }
}

const findUser = (database: AppDatabase, wallet: string): UserRow | undefined => {
  const row = database.prepare(`
    SELECT wallet_address, display_name, role FROM users WHERE wallet_address = ?
  `).get(wallet) as UserRow | undefined
  return row ? { ...row, roles: getUserRoles(database, wallet) } : undefined
}

export const issueNonce = (
  database: AppDatabase,
  config: AppConfig,
  walletInput: string,
): { wallet: string; message: string; expiresAt: string } => {
  const wallet = normalizeWallet(walletInput)
  if (!findUser(database, wallet)) {
    throw new ApiError(403, 'UNKNOWN_WALLET', 'This wallet is not registered for a project role.')
  }

  const nonce = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + config.authNonceTtlSeconds * 1000).toISOString()
  const message = [
    'SC6113 Freelancer Milestone Payment DApp',
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
    'Sign this message to authenticate. This action does not send a blockchain transaction.',
  ].join('\n')

  database.prepare(`
    INSERT INTO auth_nonces (wallet_address, nonce, message, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET nonce = excluded.nonce, message = excluded.message, expires_at = excluded.expires_at
  `).run(wallet, nonce, message, expiresAt)

  return { wallet, message, expiresAt }
}

export const verifyWalletSignature = (
  database: AppDatabase,
  config: AppConfig,
  walletInput: string,
  signature: string,
): { token: string; expiresAt: string; user: AuthUser } => {
  const wallet = normalizeWallet(walletInput)
  const nonceRecord = database.prepare(`
    SELECT message, expires_at FROM auth_nonces WHERE wallet_address = ?
  `).get(wallet) as { message: string; expires_at: string } | undefined

  if (!nonceRecord || Date.parse(nonceRecord.expires_at) <= Date.now()) {
    throw new ApiError(401, 'NONCE_EXPIRED', 'Request a new authentication nonce.')
  }

  let recovered: string
  try {
    recovered = verifyMessage(nonceRecord.message, signature).toLowerCase()
  } catch {
    throw new ApiError(401, 'INVALID_SIGNATURE', 'The wallet signature is invalid.')
  }
  if (recovered !== wallet) {
    throw new ApiError(401, 'SIGNATURE_WALLET_MISMATCH', 'The signature does not belong to the requested wallet.')
  }

  const row = findUser(database, wallet)
  if (!row) throw new ApiError(403, 'UNKNOWN_WALLET', 'This wallet is not registered for a project role.')

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + config.authSessionTtlSeconds * 1000).toISOString()
  const now = new Date().toISOString()
  inTransaction(database, () => {
    database.prepare('DELETE FROM auth_nonces WHERE wallet_address = ?').run(wallet)
    database.prepare(`
      INSERT INTO sessions (token_hash, wallet_address, expires_at, created_at) VALUES (?, ?, ?, ?)
    `).run(sha256(token), wallet, expiresAt, now)
  })

  return {
    token,
    expiresAt,
    user: { wallet, role: row.role, roles: row.roles ?? [row.role], displayName: row.display_name },
  }
}

export const requireAuth = (database: AppDatabase): RequestHandler => (request, _response, next) => {
  const authorization = request.header('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    next(new ApiError(401, 'AUTH_REQUIRED', 'Connect and authenticate a registered wallet.'))
    return
  }

  const token = authorization.slice('Bearer '.length).trim()
  const row = database.prepare(`
    SELECT u.wallet_address, u.display_name, u.role, s.expires_at
    FROM sessions s JOIN users u ON u.wallet_address = s.wallet_address
    WHERE s.token_hash = ?
  `).get(sha256(token)) as (UserRow & { expires_at: string }) | undefined

  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    next(new ApiError(401, 'SESSION_EXPIRED', 'Authenticate the wallet again.'))
    return
  }

  request.authUser = {
    wallet: row.wallet_address,
    role: row.role,
    roles: getUserRoles(database, row.wallet_address),
    displayName: row.display_name,
  }
  next()
}

export const requireRole = (...roles: Role[]): RequestHandler => (request, _response, next) => {
  if (!request.authUser || !request.authUser.roles.some((role) => roles.includes(role))) {
    next(new ApiError(403, 'FORBIDDEN_ROLE', `This action requires one of these roles: ${roles.join(', ')}.`))
    return
  }
  next()
}
