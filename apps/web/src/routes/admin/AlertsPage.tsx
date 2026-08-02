import { useCallback, useEffect, useState } from 'react'
import { type AlertLogEntry, listAlerts, acknowledgeAlert } from '../../lib/alerts'
import { apiErrorMessage } from '../../lib/errors'

const PAGE_SIZE = 20

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertLogEntry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await listAlerts({
        acknowledged: showAcknowledged ? undefined : false,
        page,
        pageSize: PAGE_SIZE,
      })
      setAlerts(result.data)
      setTotal(result.total)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load alerts.'))
    }
  }, [showAcknowledged, page])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleAcknowledge(alert: AlertLogEntry) {
    setError(null)
    try {
      await acknowledgeAlert(alert.id)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not acknowledge this alert.'))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <h1>Alerts</h1>
      <p className="subtitle">
        Every low-stock threshold breach, whether or not anyone saw the popup when it happened.
      </p>

      <div className="toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={showAcknowledged}
            onChange={(e) => {
              setShowAcknowledged(e.target.checked)
              setPage(1)
            }}
          />
          Show acknowledged too
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}

      {alerts === null ? (
        <p>Loading…</p>
      ) : alerts.length === 0 ? (
        <div className="empty-state">
          {showAcknowledged ? 'No alerts recorded yet.' : 'Nothing needs attention — no open alerts.'}
        </div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Triggered</th>
                <th>Product</th>
                <th>Location</th>
                <th>Stock at trigger</th>
                <th>Threshold</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>{new Date(alert.triggeredAt).toLocaleString()}</td>
                  <td className="sku">
                    {alert.product.skuCode} — {alert.product.name}
                  </td>
                  <td>{alert.location.name}</td>
                  <td>{alert.stockAtTrigger}</td>
                  <td>{alert.thresholdAtTrigger}</td>
                  <td>
                    {alert.acknowledgedAt ? (
                      <span className="badge badge-active">
                        Acknowledged{alert.acknowledgedBy ? ` by ${alert.acknowledgedBy.name}` : ''}
                      </span>
                    ) : (
                      <span className="badge badge-inactive">Open</span>
                    )}
                  </td>
                  <td className="row-actions">
                    {!alert.acknowledgedAt && (
                      <button className="btn btn-secondary" onClick={() => void handleAcknowledge(alert)}>
                        Acknowledge
                      </button>
                    )}
                  </td>
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
