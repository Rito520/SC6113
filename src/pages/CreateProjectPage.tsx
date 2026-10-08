import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectApi } from '../services/api'

type Draft = { title: string; description: string; amountEth: string; dueDate: string }
const blank = (): Draft => ({ title: '', description: '', amountEth: '', dueDate: '' })

export function CreateProjectPage() {
  const navigate = useNavigate(); const [drafts, setDrafts] = useState<Draft[]>([blank()]); const [error, setError] = useState<string>(); const [saving, setSaving] = useState(false)
  const update = (index: number, field: keyof Draft, value: string) => setDrafts((current) => current.map((d, i) => i === index ? { ...d, [field]: value } : d))
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const fd = new FormData(e.currentTarget); const total = Number(fd.get('amount')); const milestoneTotal = drafts.reduce((sum, m) => sum + Number(m.amountEth), 0)
    if (!drafts.every((m) => m.title && m.description && m.amountEth && m.dueDate)) { setError('Complete every milestone before creating the project.'); return }
    if (Math.abs(total - milestoneTotal) > 0.0000001) { setError(`Milestone total (${milestoneTotal} ETH) must equal the project total (${total} ETH).`); return }
    setSaving(true)
    const p = await projectApi.createProject({ title: String(fd.get('title')), description: String(fd.get('description')), freelancerAddress: String(fd.get('freelancerAddress')), totalAmountEth: total, deadline: String(fd.get('deadline')), milestones: drafts.map((m) => ({ title: m.title, description: m.description, amountEth: Number(m.amountEth), dueDate: m.dueDate })) })
    navigate(`/projects/${p.id}`)
  }
  return <><div className="page-intro"><div><h2>Create project</h2><p>Create one or more Mock milestones. The UI checks that their payment total matches the project amount.</p></div></div>{error && <div className="notice error">{error}</div>}<form className="panel form-grid" onSubmit={(e) => void submit(e)}><label>Project title<input name="title" required placeholder="e.g. Website redesign" /></label><label>Freelancer wallet address<input name="freelancerAddress" required placeholder="0x… (placeholder accepted in mock mode)" /></label><label className="wide">Project description<textarea name="description" required /></label><label>Total payment (ETH)<input name="amount" type="number" min="0.001" step="0.001" required /></label><label>Project deadline<input name="deadline" type="date" required /></label>{drafts.map((m, i) => <fieldset className="wide" key={i}><legend>Milestone {i + 1}</legend><div className="milestone-form"><label>Title<input value={m.title} onChange={(e) => update(i, 'title', e.target.value)} required /></label><label>Amount (ETH)<input type="number" min="0.001" step="0.001" value={m.amountEth} onChange={(e) => update(i, 'amountEth', e.target.value)} required /></label><label>Due date<input type="date" value={m.dueDate} onChange={(e) => update(i, 'dueDate', e.target.value)} required /></label><label className="form-wide">Description<textarea value={m.description} onChange={(e) => update(i, 'description', e.target.value)} required /></label></div>{drafts.length > 1 && <button type="button" className="text-button" onClick={() => setDrafts((current) => current.filter((_, j) => j !== i))}>Remove milestone</button>}</fieldset>)}<div className="wide form-actions"><button type="button" className="secondary" onClick={() => setDrafts((current) => [...current, blank()])}>+ Add milestone</button><button className="primary" disabled={saving}>{saving ? 'Creating…' : 'Create mock project'}</button></div></form></>
}
