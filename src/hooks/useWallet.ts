import { useEffect, useState } from 'react'
import { walletService } from '../services/blockchain/wallet'

export function useWallet() {
  const [address, setAddress] = useState<string>()
  const [error, setError] = useState<string>()
  const [networkOk, setNetworkOk] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const refresh = async () => { setAddress(await walletService.getWalletAddress()); const n = await walletService.checkNetwork(); setNetworkOk(n.matches ?? true) }
  useEffect(() => { void refresh(); walletService.onAccountsChanged((accounts) => setAddress(accounts[0])); walletService.onChainChanged(() => void refresh()) }, [])
  const connect = async () => { setConnecting(true); setError(undefined); try { setAddress(await walletService.connectWallet()); const n = await walletService.checkNetwork(); setNetworkOk(n.matches ?? true) } catch (e) { setError(e instanceof Error ? e.message : 'Wallet connection was not completed.') } finally { setConnecting(false) } }
  return { address, error, networkOk, connecting, available: walletService.isAvailable(), connect, refresh }
}
