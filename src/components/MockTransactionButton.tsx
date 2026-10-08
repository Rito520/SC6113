import { useState } from 'react'
import { walletService } from '../services/blockchain/wallet'
export function MockTransactionButton({ label, onComplete }: { label: string; onComplete?: () => void }) {
  const [state, setState] = useState<'idle' | 'preparing' | 'pending' | 'confirmed'>('idle')
  const run = async () => { setState('preparing'); await new Promise((r) => setTimeout(r, 350)); setState('pending'); await walletService.runMockTransaction(label); setState('confirmed'); onComplete?.() }
  if (state === 'confirmed') return <span className="mock-confirmed">Mock transaction confirmed</span>
  return <button className="primary" disabled={state !== 'idle'} onClick={() => void run()}>{state === 'idle' ? label : state === 'preparing' ? 'Preparing…' : 'Mock pending…'}</button>
}
