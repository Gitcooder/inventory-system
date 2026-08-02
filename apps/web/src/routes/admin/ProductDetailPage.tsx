import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProductDetails, type ProductDetails } from '../../lib/catalog'
import { apiErrorMessage } from '../../lib/errors'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)

  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isFinite(productId)) return
    void getProductDetails(productId)
      .then(setDetails)
      .catch((err: unknown) => setError(apiErrorMessage(err, 'Could not load product details.')))
  }, [productId])

  if (error) return <p className="form-error">{error}</p>
  if (details === null) return <p>Loading…</p>

  const { product, stockByLocation, totalStock, usageSummary, usageLedger, adjustmentLedger, reviewSummary } =
    details

  return (
    <>
      <Link to="/admin/products" style={{ fontSize: '0.85rem' }}>
        ← Back to products
      </Link>
      <h1 style={{ marginTop: 'var(--space-3)' }}>{product.name}</h1>
      <p className="subtitle">
        {product.brand.name} · {product.category.name} · <span className="sku">{product.skuCode}</span> ·{' '}
        <span className={`badge ${product.isActive ? 'badge-active' : 'badge-inactive'}`}>
          {product.isActive ? 'Active' : 'Inactive'}
        </span>
      </p>
      {product.usesDescription && <p>{product.usesDescription}</p>}

      <div className="toolbar" style={{ gap: 'var(--space-5)' }}>
        <div>
          <strong>{totalStock}</strong> <span className="subtitle">total stock</span>
        </div>
        <div>
          <strong>{usageSummary.timesDispensed}</strong>{' '}
          <span className="subtitle">times dispensed ({usageSummary.totalQuantityDispensed} units)</span>
        </div>
        <div>
          <strong>{reviewSummary.averageRating?.toFixed(1) ?? '—'}</strong>{' '}
          <span className="subtitle">avg rating ({reviewSummary.approvedCount} approved reviews)</span>
        </div>
      </div>

      <h1 style={{ fontSize: '1.1rem', marginTop: 'var(--space-6)' }}>Stock by location</h1>
      {stockByLocation.length === 0 ? (
        <div className="empty-state">Not stocked anywhere yet.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Batch</th>
              <th>Quantity</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {stockByLocation.map((s) => (
              <tr key={s.id}>
                <td>{s.location.name}</td>
                <td>{s.batchNumber}</td>
                <td>{s.quantity}</td>
                <td>{s.thresholdLimit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h1 style={{ fontSize: '1.1rem', marginTop: 'var(--space-6)' }}>Recent dispensing</h1>
      {usageLedger.length === 0 ? (
        <div className="empty-state">Never dispensed.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Qty</th>
              <th>Location</th>
              <th>Purpose</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {usageLedger.map((u) => (
              <tr key={u.id}>
                <td>{new Date(u.timestamp).toLocaleString()}</td>
                <td>{u.quantityUsed}</td>
                <td>{u.location.name}</td>
                <td>{u.purposeDescription ?? '—'}</td>
                <td>{u.user.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h1 style={{ fontSize: '1.1rem', marginTop: 'var(--space-6)' }}>Recent stock adjustments</h1>
      {adjustmentLedger.length === 0 ? (
        <div className="empty-state">No adjustments recorded.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Change</th>
              <th>Location</th>
              <th>Reason</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {adjustmentLedger.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.timestamp).toLocaleString()}</td>
                <td>{a.adjustmentType}</td>
                <td>{a.quantityChange > 0 ? `+${a.quantityChange}` : a.quantityChange}</td>
                <td>{a.location.name}</td>
                <td>{a.reason ?? '—'}</td>
                <td>{a.adjustedBy.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
