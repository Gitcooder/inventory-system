import { useEffect, useState, type FormEvent } from 'react'
import {
  type Brand,
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
} from '../../../lib/catalog'
import { apiErrorMessage } from '../../../lib/errors'

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  async function refresh() {
    try {
      setBrands(await listBrands())
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load brands.'))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createBrand(newName.trim())
      setNewName('')
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create brand.'))
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(brand: Brand) {
    setEditingId(brand.id)
    setEditName(brand.name)
  }

  async function saveEdit(id: number) {
    setError(null)
    try {
      await updateBrand(id, editName.trim())
      setEditingId(null)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update brand.'))
    }
  }

  async function handleDelete(brand: Brand) {
    if (!confirm(`Delete "${brand.name}"? This can't be undone.`)) return
    setError(null)
    try {
      await deleteBrand(brand.id)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not delete brand — it may still be in use by a product.'))
    }
  }

  return (
    <>
      <h1>Brands</h1>
      <p className="subtitle">Manufacturer and brand names products are grouped under.</p>

      <form className="inline-form" onSubmit={(e) => void handleCreate(e)}>
        <div className="field">
          <label htmlFor="brand-name">New brand name</label>
          <input
            id="brand-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            minLength={1}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting || !newName.trim()}>
          Add brand
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      {brands === null ? (
        <p>Loading…</p>
      ) : brands.length === 0 ? (
        <div className="empty-state">No brands yet — add one above to get started.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id}>
                <td>
                  {editingId === brand.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  ) : (
                    brand.name
                  )}
                </td>
                <td className="row-actions">
                  {editingId === brand.id ? (
                    <>
                      <button className="btn btn-primary" onClick={() => void saveEdit(brand.id)}>
                        Save
                      </button>
                      <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary" onClick={() => startEdit(brand)}>
                        Rename
                      </button>
                      <button className="btn btn-danger" onClick={() => void handleDelete(brand)}>
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
