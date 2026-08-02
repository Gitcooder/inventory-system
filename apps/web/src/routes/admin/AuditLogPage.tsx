import { useCallback, useEffect, useState } from 'react'
import { type AuditLogEntry, listAuditLog } from '../../lib/auditLog'
import { apiErrorMessage } from '../../lib/errors'

const PAGE_SIZE = 25

function summarizeValue(value: unknown): string {
  if (value == null) return '—'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await listAuditLog({
        action: action.trim() || undefined,
        entityType: entityType.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      setEntries(result.data)
      setTotal(result.total)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load the audit log.'))
    }
  }, [action, entityType, page])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <h1>Audit log</h1>
      <p className="subtitle">
        Who created users, changed a product&apos;s status, moderated a review, or deleted catalog data.
      </p>

      <div className="toolbar">
        <input
          placeholder="Filter by action (e.g. user.create)"
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
        />
        <input
          placeholder="Filter by entity type (e.g. Product)"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value)
            setPage(1)
          }}
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      {entries === null ? (
        <p>Loading…</p>
      ) : entries.length === 0 ? (
        <div className="empty-state">No matching audit entries.</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Before</th>
                <th>After</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.timestamp).toLocaleString()}</td>
                  <td>{e.user ? `${e.user.name}` : '—'}</td>
                  <td>{e.action}</td>
                  <td>
                    {e.entityType}
                    {e.entityId != null ? ` #${e.entityId}` : ''}
                  </td>
                  <td className="sku">{summarizeValue(e.oldValue)}</td>
                  <td className="sku">{summarizeValue(e.newValue)}</td>
                  <td>{e.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages} ({total} total)
            </span>
            <button
              className="btn btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  )
}
