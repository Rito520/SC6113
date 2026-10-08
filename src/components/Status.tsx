export function Status({ value }: { value: string }) { return <span className={`status status-${value.toLowerCase()}`}>{value.replaceAll('_', ' ')}</span> }
export function Toast({ message, type = 'success' }: { message?: string; type?: 'success' | 'error' }) { return message ? <div className={`toast ${type}`}>{message}</div> : null }
