import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { listProducts, findProductBySku, type Product } from '../../lib/catalog'
import { listLocations, type Location } from '../../lib/catalog'
import { dispenseProduct, listUsageLogs, type UsageLog } from '../../lib/dispense'
import { apiErrorMessage } from '../../lib/errors'

export default function StaffHome() {
  const { user, logout } = useAuth()

  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [recent, setRecent] = useState<UsageLog[] | null>(null)

  const [skuQuery, setSkuQuery] = useState('')
  const [skuError, setSkuError] = useState<string | null>(null)

  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [quantityUsed, setQuantityUsed] = useState('1')
  const [purpose, setPurpose] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const refreshRecent = useCallback(async () => {
    try {
      const result = await listUsageLogs({ pageSize: 10 })
      setRecent(result.data)
    } catch {
      // Non-critical for this view — the dispense form still works without
      // the activity feed, so fail quietly here rather than blocking the page.
    }
  }, [])

  useEffect(() => {
    void listProducts({ pageSize: 100 }).then((r) => setProducts(r.data))
    void listLocations().then(setLocations)
    void refreshRecent()
  }, [refreshRecent])

  async function handleSkuLookup() {
    setSkuError(null)
    if (!skuQuery.trim()) return
    try {
      const product = await findProductBySku(skuQuery.trim())
      setProductId(String(product.id))
      setSkuQuery('')
    } catch {
      setSkuError(`No product found for SKU "${skuQuery.trim()}".`)
    }
  }

  async function handleDispense(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      const result = await dispenseProduct({
        productId: Number(productId),
        locationId: Number(locationId),
        quantityUsed: Number(quantityUsed),
        purposeDescription: purpose.trim() || undefined,
      })
      setSuccess(
        `Dispensed ${quantityUsed} × ${result.usageLog.product.name}. ${result.stock.quantity} left at ${result.stock.location.name}.`,
      )
      setQuantityUsed('1')
      setPurpose('')
      await refreshRecent()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not record this dispense.'))
    } finally {
      setSubmitting(false)
    }
  }

  const formValid = productId && locationId && Number(quantityUsed) > 0

  return (
    <div className="panel" style={{ maxWidth: 760 }}>
      <h1>Dispensing</h1>
      <p className="subtitle">
        Signed in as {user?.name} ({user?.email})
      </p>

      <div className="inline-form" style={{ marginBottom: 'var(--space-3)' }}>
        <div className="field">
          <label htmlFor="sku-lookup">Scan or enter SKU</label>
          <input
            id="sku-lookup"
            value={skuQuery}
            onChange={(e) => setSkuQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSkuLookup()
              }
            }}
            placeholder="e.g. ABC-123"
          />
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void handleSkuLookup()}>
          Find
        </button>
      </div>
      {skuError && <p className="form-error">{skuError}</p>}

      <form className="inline-form" onSubmit={(e) => void handleDispense(e)}>
        <div className="field">
          <label htmlFor="d-product">Product</label>
          <select id="d-product" value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="" disabled>
              Select…
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.skuCode})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="d-location">Location</label>
          <select id="d-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
            <option value="" disabled>
              Select…
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="d-qty">Quantity</label>
          <input
            id="d-qty"
            type="number"
            min={1}
            value={quantityUsed}
            onChange={(e) => setQuantityUsed(e.target.value)}
            required
            style={{ width: 90 }}
          />
        </div>
        <div className="field">
          <label htmlFor="d-purpose">Purpose / task</label>
          <input
            id="d-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="What is this for?"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting || !formValid}>
          {submitting ? 'Dispensing…' : 'Dispense'}
        </button>
      </form>

      {success && (
        <p className="subtitle" style={{ color: 'var(--color-accent)' }}>
          {success}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}

      <h1 style={{ fontSize: '1.1rem', marginTop: 'var(--space-6)' }}>Recent activity</h1>
      {recent === null ? (
        <p>Loading…</p>
      ) : recent.length === 0 ? (
        <div className="empty-state">Nothing dispensed yet.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Location</th>
              <th>Purpose</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
                <td className="sku">{log.product.skuCode} — {log.product.name}</td>
                <td>{log.quantityUsed}</td>
                <td>{log.location.name}</td>
                <td>{log.purposeDescription ?? '—'}</td>
                <td>{log.user.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button onClick={() => void logout()} style={{ marginTop: 'var(--space-5)' }}>
        Log out
      </button>
    </div>
  )
}
