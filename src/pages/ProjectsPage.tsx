import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Status } from '../components/Status'
import { projectApi } from '../services/api'
import type { Project, Role } from '../types/domain'
export function ProjectsPage() { const { role } = useOutletContext<{ role: Role }>(); const [items, setItems] = useState<Project[]>([]); useEffect(() => { void projectApi.getProjects(role).then(setItems) }, [role]); return <><div className="page-intro"><div><h2>Projects</h2><p>All records below are centralized Mock Data until the backend adapter is enabled.</p></div>{role === 'CLIENT' && <Link className="primary link-button" to="/projects/new">Create project</Link>}</div><section className="panel table-wrap"><table><thead><tr><th>Project</th><th>Counterparty</th><th>Amount</th><th>Deadline</th><th>Status</th></tr></thead><tbody>{items.map((p) => <tr key={p.id}><td><Link to={`/projects/${p.id}`}><b>{p.title}</b><small>{p.id}</small></Link></td><td>{role === 'CLIENT' ? p.freelancerName : p.clientName}</td><td>{p.totalAmountEth} ETH</td><td>{p.deadline}</td><td><Status value={p.status} /></td></tr>)}</tbody></table></section></> }
