import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  type Product,
  type Brand,
  type Category,
  listProducts,
  listBrands,
  listCategories,
  createProduct,
  updateProduct,
  setProductStatus,
} from '../../../lib/catalog'
import { apiErrorMessage } from '../../../lib/errors'

const PAGE_SIZE = 10

interface ProductFormState {
  skuCode: string
  name: string
  brandId: string
  categoryId: string
  usesDescription: string
  unitOfMeasure: string
}

const EMPTY_FORM: ProductFormState = {
  skuCode: '',
  name: '',
  brandId: '',
  categoryId: '',
  usesDescription: '',
  unitOfMeasure: '',
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [brands, setBrands] = useState<Brand[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [q, setQ] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')

  // Create/edit form (mutually exclusive — editingId set means the form below edits that product)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await listProducts({
        q: q.trim() || undefined,
        brandId: brandFilter ? Number(brandFilter) : undefined,
        categoryId: categoryFilter ? Number(categoryFilter) : undefined,
        isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
        page,
        pageSize: PAGE_SIZE,
      })
      setProducts(result.data)
      setTotal(result.total)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load products.'))
    }
  }, [q, brandFilter, categoryFilter, statusFilter, page])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void listBrands().then(setBrands)
    void listCategories().then(setCategories)
  }, [])

  // Any filter change resets to page 1 — otherwise you can land on an empty
  // "page 3" after narrowing a search that only has one result.
  function updateFilter(setter: (v: string) => void) {
    return (value: string) => {
      setter(value)
      setPage(1)
    }
  }

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function startEdit(product: Product) {
    setEditingId(product.id)
    setForm({
      skuCode: product.skuCode,
      name: product.name,
      brandId: String(product.brandId),
      categoryId: String(product.categoryId),
      usesDescription: product.usesDescription ?? '',
      unitOfMeasure: product.unitOfMeasure ?? '',
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const dto = {
      skuCode: form.skuCode.trim(),
      name: form.name.trim(),
      brandId: Number(form.brandId),
      categoryId: Number(form.categoryId),
      usesDescription: form.usesDescription.trim() || undefined,
      unitOfMeasure: form.unitOfMeasure.trim() || undefined,
    }
    try {
      if (editingId != null) {
        await updateProduct(editingId, dto)
      } else {
        await createProduct(dto)
      }
      startCreate()
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, editingId != null ? 'Could not update product.' : 'Could not create product.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(product: Product) {
    setError(null)
    try {
      await setProductStatus(product.id, !product.isActive)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not change product status.'))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const formValid = form.skuCode.trim() && form.name.trim() && form.brandId && form.categoryId

  return (
    <>
      <h1>Products</h1>
      <p className="subtitle">The catalog items stock and dispensing are tracked against.</p>

      <form className="inline-form" onSubmit={(e) => void handleSubmit(e)}>
        <div className="field">
          <label htmlFor="p-sku">SKU / barcode</label>
          <input
            id="p-sku"
            value={form.skuCode}
            onChange={(e) => setForm({ ...form, skuCode: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="p-name">Name</label>
          <input
            id="p-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="p-brand">Brand</label>
          <select
            id="p-brand"
            value={form.brandId}
            onChange={(e) => setForm({ ...form, brandId: e.target.value })}
            required
          >
            <option value="" disabled>
              Select…
            </option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-category">Category</label>
          <select
            id="p-category"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            required
          >
            <option value="" disabled>
              Select…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-unit">Unit of measure</label>
          <input
            id="p-unit"
            placeholder="e.g. box, bottle"
            value={form.unitOfMeasure}
            onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="p-uses">Uses / description</label>
          <input
            id="p-uses"
            value={form.usesDescription}
            onChange={(e) => setForm({ ...form, usesDescription: e.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting || !formValid}>
          {editingId != null ? 'Save changes' : 'Add product'}
        </button>
        {editingId != null && (
          <button type="button" className="btn btn-secondary" onClick={startCreate}>
            Cancel
          </button>
        )}
      </form>

      {error && <p className="form-error">{error}</p>}

      <div className="toolbar">
        <input
          placeholder="Search name or SKU…"
          value={q}
          onChange={(e) => updateFilter(setQ)(e.target.value)}
        />
        <select value={brandFilter} onChange={(e) => updateFilter(setBrandFilter)(e.target.value)}>
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={categoryFilter} onChange={(e) => updateFilter(setCategoryFilter)(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => updateFilter((v) => setStatusFilter(v as typeof statusFilter))(e.target.value)}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
      </div>

      {products === null ? (
        <p>Loading…</p>
      ) : products.length === 0 ? (
        <div className="empty-state">
          No products match these filters — try clearing the search or add a new product above.
        </div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Brand</th>
                <th>Category</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="sku">{product.skuCode}</td>
                  <td>{product.name}</td>
                  <td>{product.brand.name}</td>
                  <td>{product.category.name}</td>
                  <td>
                    <span className={`badge ${product.isActive ? 'badge-active' : 'badge-inactive'}`}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="row-actions">
                    <Link className="btn btn-secondary" to={`/admin/products/${product.id}`}>
                      View
                    </Link>
                    <button className="btn btn-secondary" onClick={() => startEdit(product)}>
                      Edit
                    </button>
                    <button
                      className={product.isActive ? 'btn btn-danger' : 'btn btn-secondary'}
                      onClick={() => void toggleStatus(product)}
                    >
                      {product.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
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
