import { useCallback, useEffect, useState } from 'react'
import { type UsageSummaryRow, getUsageSummary, downloadUsageSummaryCsv } from '../../lib/reports'
import { apiErrorMessage } from '../../lib/errors'

export default function ReportsPage() {
  const [rows, setRows] = useState<UsageSummaryRow[] | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await getUsageSummary({ from: from || undefined, to: to || undefined })
      setRows(result)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load the report.'))
    }
  }, [from, to])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleExport() {
    setError(null)
    setExporting(true)
    try {
      await downloadUsageSummaryCsv({ from: from || undefined, to: to || undefined })
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not export the report.'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <h1>Usage report</h1>
      <p className="subtitle">Total times dispensed and total quantity per product, most-dispensed first.</p>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="rep-from">From</label>
          <input id="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rep-to">To</label>
          <input id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => void handleExport()} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {rows === null ? (
        <p>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state">No dispensing activity in this range.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Times dispensed</th>
              <th>Total quantity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId}>
                <td>{r.productName}</td>
                <td className="sku">{r.skuCode}</td>
                <td>{r.timesDispensed}</td>
                <td>{r.totalQuantityDispensed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
