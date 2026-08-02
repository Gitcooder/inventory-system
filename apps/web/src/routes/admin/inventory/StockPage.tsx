import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  type InventoryStock,
  type StockAdjustment,
  type AdjustmentType,
  ADJUSTMENT_TYPES,
  listInventory,
  updateStockThreshold,
  adjustStock,
  listStockHistory,
} from '../../../lib/inventory'
import { listProducts, type Product } from '../../../lib/catalog'
import { listLocations, type Location } from '../../../lib/catalog'
import { apiErrorMessage } from '../../../lib/errors'

const PAGE_SIZE = 20

interface AdjustFormState {
  productId: string
  locationId: string
  adjustmentType: AdjustmentType
  quantityChange: string
  reason: string
}

const EMPTY_ADJUST_FORM: AdjustFormState = {
  productId: '',
  locationId: '',
  adjustmentType: 'restock',
  quantityChange: '',
  reason: '',
}

export default function StockPage() {
  const [stocks, setStocks] = useState<InventoryStock[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Filters
  const [productFilter, setProductFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  // Adjustment form
  const [form, setForm] = useState<AdjustFormState>(EMPTY_ADJUST_FORM)
  const [submitting, setSubmitting] = useState(false)

  // Threshold inline edit
  const [editingThresholdId, setEditingThresholdId] = useState<number | null>(null)
  const [thresholdValue, setThresholdValue] = useState('')

  // Expandable history
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [history, setHistory] = useState<StockAdjustment[] | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await listInventory({
        productId: productFilter ? Number(productFilter) : undefined,
        locationId: locationFilter ? Number(locationFilter) : undefined,
        lowStockOnly: lowStockOnly || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      setStocks(result.data)
      setTotal(result.total)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load stock levels.'))
    }
  }, [productFilter, locationFilter, lowStockOnly, page])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    // Only active products/all locations needed for the pickers — fetch a
    // generous page size since this drives dropdowns, not a paginated table.
    void listProducts({ pageSize: 100 }).then((r) => setProducts(r.data))
    void listLocations().then(setLocations)
  }, [])

  function updateFilter<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  async function handleAdjust(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      await adjustStock({
        productId: Number(form.productId),
        locationId: Number(form.locationId),
        adjustmentType: form.adjustmentType,
        quantityChange: Number(form.quantityChange),
        reason: form.reason.trim() || undefined,
      })
      setNotice('Adjustment recorded.')
      setForm(EMPTY_ADJUST_FORM)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not record adjustment.'))
    } finally {
      setSubmitting(false)
    }
  }

  function startEditThreshold(stock: InventoryStock) {
    setEditingThresholdId(stock.id)
    setThresholdValue(String(stock.thresholdLimit))
  }

  async function saveThreshold(id: number) {
    setError(null)
    try {
      await updateStockThreshold(id, Number(thresholdValue))
      setEditingThresholdId(null)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update threshold.'))
    }
  }

  async function toggleHistory(stock: InventoryStock) {
    if (expandedId === stock.id) {
      setExpandedId(null)
      setHistory(null)
      return
    }
    setExpandedId(stock.id)
    setHistory(null)
    try {
      const result = await listStockHistory(stock.id)
      setHistory(result.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load adjustment history.'))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const formValid = form.productId && form.locationId && form.quantityChange

  return (
    <>
      <h1>Stock</h1>
      <p className="subtitle">Physical stock per product and location. Every change is logged below.</p>

      <form className="inline-form" onSubmit={(e) => void handleAdjust(e)}>
        <div className="field">
          <label htmlFor="a-product">Product</label>
          <select
            id="a-product"
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
            required
          >
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
          <label htmlFor="a-location">Location</label>
          <select
            id="a-location"
            value={form.locationId}
            onChange={(e) => setForm({ ...form, locationId: e.target.value })}
            required
          >
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
          <label htmlFor="a-type">Type</label>
          <select
            id="a-type"
            value={form.adjustmentType}
            onChange={(e) => setForm({ ...form, adjustmentType: e.target.value as AdjustmentType })}
          >
            {ADJUSTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="a-qty">
            Quantity change{' '}
            {form.adjustmentType === 'restock'
              ? '(positive)'
              : form.adjustmentType === 'damage' || form.adjustmentType === 'expired'
                ? '(negative)'
                : '(+/-)'}
          </label>
          <input
            id="a-qty"
            type="number"
            value={form.quantityChange}
            onChange={(e) => setForm({ ...form, quantityChange: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="a-reason">Reason</label>
          <input
            id="a-reason"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting || !formValid}>
          Record adjustment
        </button>
      </form>

      {notice && <p className="subtitle">{notice}</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="toolbar">
        <select value={productFilter} onChange={(e) => updateFilter(setProductFilter)(e.target.value)}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={locationFilter} onChange={(e) => updateFilter(setLocationFilter)(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => updateFilter(setLowStockOnly)(e.target.checked)}
          />
          Low stock only
        </label>
      </div>

      {stocks === null ? (
        <p>Loading…</p>
      ) : stocks.length === 0 ? (
        <div className="empty-state">
          No stock records match these filters — record an adjustment above to create one.
        </div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Location</th>
                <th>Batch</th>
                <th>Quantity</th>
                <th>Threshold</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => {
                const low = stock.quantity <= stock.thresholdLimit
                return (
                  <Fragment key={stock.id}>
                    <tr>
                      <td className="sku">{stock.product.skuCode} — {stock.product.name}</td>
                      <td>{stock.location.name}</td>
                      <td>{stock.batchNumber}</td>
                      <td>{stock.quantity}</td>
                      <td>
                        {editingThresholdId === stock.id ? (
                          <input
                            style={{ width: 70 }}
                            type="number"
                            value={thresholdValue}
                            onChange={(e) => setThresholdValue(e.target.value)}
                          />
                        ) : (
                          stock.thresholdLimit
                        )}
                      </td>
                      <td>
                        <span className={`badge ${low ? 'badge-inactive' : 'badge-active'}`}>
                          {low ? 'Low stock' : 'OK'}
                        </span>
                      </td>
                      <td className="row-actions">
                        {editingThresholdId === stock.id ? (
                          <>
                            <button className="btn btn-primary" onClick={() => void saveThreshold(stock.id)}>
                              Save
                            </button>
                            <button className="btn btn-secondary" onClick={() => setEditingThresholdId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-secondary" onClick={() => startEditThreshold(stock)}>
                              Edit threshold
                            </button>
                            <button className="btn btn-secondary" onClick={() => void toggleHistory(stock)}>
                              {expandedId === stock.id ? 'Hide history' : 'History'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {expandedId === stock.id && (
                      <tr>
                        <td colSpan={7}>
                          {history === null ? (
                            <p>Loading history…</p>
                          ) : history.length === 0 ? (
                            <p className="subtitle">No adjustments recorded yet for this stock row.</p>
                          ) : (
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>When</th>
                                  <th>Type</th>
                                  <th>Change</th>
                                  <th>By</th>
                                  <th>Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {history.map((h) => (
                                  <tr key={h.id}>
                                    <td>{new Date(h.timestamp).toLocaleString()}</td>
                                    <td>{h.adjustmentType}</td>
                                    <td>{h.quantityChange > 0 ? `+${h.quantityChange}` : h.quantityChange}</td>
                                    <td>{h.adjustedBy.name}</td>
                                    <td>{h.reason ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
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
