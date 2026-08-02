import { useEffect, useState, type FormEvent } from 'react'
import {
  type Category,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../../../lib/catalog'
import { apiErrorMessage } from '../../../lib/errors'

const NO_PARENT = ''

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newParentId, setNewParentId] = useState<string>(NO_PARENT)
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  async function refresh() {
    try {
      setCategories(await listCategories())
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load categories.'))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  function parentName(category: Category): string {
    if (category.parentCategoryId == null || !categories) return '—'
    return categories.find((c) => c.id === category.parentCategoryId)?.name ?? '—'
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createCategory({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        parentCategoryId: newParentId === NO_PARENT ? undefined : Number(newParentId),
      })
      setNewName('')
      setNewDescription('')
      setNewParentId(NO_PARENT)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create category.'))
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(category: Category) {
    setEditingId(category.id)
    setEditName(category.name)
  }

  async function saveEdit(id: number) {
    setError(null)
    try {
      await updateCategory(id, { name: editName.trim() })
      setEditingId(null)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update category.'))
    }
  }

  async function handleDelete(category: Category) {
    if (!confirm(`Delete "${category.name}"? Its subcategories will move to the top level.`)) return
    setError(null)
    try {
      await deleteCategory(category.id)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not delete category — it may still be in use by a product.'))
    }
  }

  return (
    <>
      <h1>Categories</h1>
      <p className="subtitle">Group products by use or drug class. Categories can be nested.</p>

      <form className="inline-form" onSubmit={(e) => void handleCreate(e)}>
        <div className="field">
          <label htmlFor="cat-name">Name</label>
          <input id="cat-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="cat-description">Description</label>
          <input
            id="cat-description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cat-parent">Parent category</label>
          <select id="cat-parent" value={newParentId} onChange={(e) => setNewParentId(e.target.value)}>
            <option value={NO_PARENT}>None (top level)</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting || !newName.trim()}>
          Add category
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      {categories === null ? (
        <p>Loading…</p>
      ) : categories.length === 0 ? (
        <div className="empty-state">No categories yet — add one above to get started.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Parent</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>
                  {editingId === category.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  ) : (
                    category.name
                  )}
                </td>
                <td>{parentName(category)}</td>
                <td>{category.description ?? '—'}</td>
                <td className="row-actions">
                  {editingId === category.id ? (
                    <>
                      <button className="btn btn-primary" onClick={() => void saveEdit(category.id)}>
                        Save
                      </button>
                      <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary" onClick={() => startEdit(category)}>
                        Rename
                      </button>
                      <button className="btn btn-danger" onClick={() => void handleDelete(category)}>
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
