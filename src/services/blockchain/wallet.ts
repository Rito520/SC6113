import { BrowserProvider } from 'ethers'
import { env } from '../../config/env'

type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on: (event: string, listener: (...args: unknown[]) => void) => void; removeListener?: (event: string, listener: (...args: unknown[]) => void) => void }
declare global { interface Window { ethereum?: EthereumProvider } }

export const walletService = {
  isAvailable: () => Boolean(window.ethereum),
  async connectWallet() {
    if (!window.ethereum) throw new Error('MetaMask is not available. Install the extension, then refresh this page.')
    const provider = new BrowserProvider(window.ethereum as never)
    await provider.send('eth_requestAccounts', [])
    const signer = await provider.getSigner()
    return signer.address
  },
  async getWalletAddress() {
    if (!window.ethereum) return undefined
    const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[]
    return accounts[0]
  },
  async checkNetwork() {
    if (!window.ethereum) return { connected: false, expected: env.chainId, actual: undefined }
    const actual = await window.ethereum.request({ method: 'eth_chainId' }) as string
    return { connected: true, expected: env.chainId, actual, matches: !env.chainId || actual === env.chainId }
  },
  async switchNetwork() {
    if (!window.ethereum) throw new Error('MetaMask is not available.')
    if (!env.chainId) throw new Error('No required network is configured yet. Waiting for B/E to confirm network information.')
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: env.chainId }] })
  },
  onAccountsChanged(callback: (accounts: string[]) => void) { window.ethereum?.on('accountsChanged', callback as (...args: unknown[]) => void) },
  onChainChanged(callback: (chainId: string) => void) { window.ethereum?.on('chainChanged', callback as (...args: unknown[]) => void) },
  // TODO(B): instantiate ethers.Contract only after ABI, address, and method mapping are confirmed.
  async runMockTransaction(label: string) { await new Promise((r) => setTimeout(r, 850)); return { label, status: 'CONFIRMED' as const, hash: 'MOCK—no on-chain transaction' } },
}
