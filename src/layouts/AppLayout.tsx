import { NavLink, Outlet } from 'react-router-dom'
import type { Role } from '../types/domain'
import { useWallet } from '../hooks/useWallet'
import { Toast } from '../components/Status'

const links = [{ to: '/', label: 'Dashboard' }, { to: '/projects', label: 'Projects' }, { to: '/transactions', label: 'Transactions' }, { to: '/events', label: 'Event logs' }, { to: '/disputes', label: 'Disputes' }]
export function AppLayout({ role, setRole }: { role: Role; setRole: (role: Role) => void }) {
  const wallet = useWallet()
  return <div className="app-shell"><aside><div className="brand">▣ <span>Milestone<br />Escrow</span></div><nav>{links.map((l) => <NavLink key={l.to} to={l.to} end={l.to === '/'}>{l.label}</NavLink>)}</nav><div className="aside-note">Demo is in <b>Mock Mode</b>. No financial action is sent on-chain.</div></aside>
    <main><header><div><p className="eyebrow">Freelancer Milestone Payment DApp</p><h1>{role[0] + role.slice(1).toLowerCase()} workspace</h1></div><div className="header-actions"><select aria-label="Demo role" value={role} onChange={(e) => setRole(e.target.value as Role)}>{(['CLIENT', 'FREELANCER', 'ARBITRATOR'] as Role[]).map((r) => <option key={r} value={r}>{r[0] + r.slice(1).toLowerCase()}</option>)}</select><button className="wallet" onClick={() => void wallet.connect()} disabled={wallet.connecting}>{wallet.connecting ? 'Connecting…' : wallet.address ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : wallet.available ? 'Connect MetaMask' : 'MetaMask unavailable'}</button></div></header>
      {!wallet.networkOk && <div className="notice">Wallet network differs from the configured network. Network will be confirmed by B/E.</div>}<Toast message={wallet.error} type="error" /><Outlet context={{ role }} /></main></div>
}
