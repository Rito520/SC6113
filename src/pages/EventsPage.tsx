import { useEffect, useState } from 'react'
import { projectApi } from '../services/api'
import type { ChainEvent } from '../types/domain'
export function EventsPage() { const [items, setItems] = useState<ChainEvent[]>([]); useEffect(() => { void projectApi.getEvents().then(setItems) }, []); return <><div className="page-intro"><div><h2>Blockchain event logs</h2><p>Mock blockchain events. Replace the adapter with B's confirmed events or C's event API.</p></div></div><section className="timeline">{items.map((e) => <article className="event" key={e.id}><div className="event-dot" /><div><b>{e.eventName}</b><p>{e.details}</p><small>{e.projectId} · {e.actor} · {new Date(e.timestamp).toLocaleString()} · <code>{e.txHash}</code></small></div></article>)}</section></> }
