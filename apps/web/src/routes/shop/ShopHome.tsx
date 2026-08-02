import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listProducts, listCategories, type Product, type Category } from '../../lib/catalog'
import { apiErrorMessage } from '../../lib/errors'

const PAGE_SIZE = 12

export default function ShopHome() {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [categories, setCategories] = useState<Category[]>([])
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await listProducts({
        q: q.trim() || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      setProducts(result.data)
      setTotal(result.total)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load products.'))
    }
  }, [q, categoryId, page])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void listCategories().then(setCategories)
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <h1>Browse products</h1>
      <div className="toolbar">
        <input
          placeholder="Search…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}

      {products === null ? (
        <p>Loading…</p>
      ) : products.length === 0 ? (
        <div className="empty-state">No products match your search.</div>
      ) : (
        <>
          <div className="product-grid">
            {products.map((p) => (
              <Link key={p.id} to={`/shop/products/${p.id}`} className="product-card">
                <span className="brand-name">{p.brand.name}</span>
                <h3>{p.name}</h3>
                <span className="sku">{p.skuCode}</span>
              </Link>
            ))}
          </div>

          <div className="pagination">
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
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
