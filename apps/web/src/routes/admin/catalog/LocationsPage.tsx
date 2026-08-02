import { useEffect, useState, type FormEvent } from 'react'
import {
  type Location,
  LOCATION_TYPES,
  type LocationType,
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from '../../../lib/catalog'
import { apiErrorMessage } from '../../../lib/errors'

const NO_PARENT = ''

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<LocationType>('warehouse')
  const [newParentId, setNewParentId] = useState<string>(NO_PARENT)
  const [newAddress, setNewAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  async function refresh() {
    try {
      setLocations(await listLocations())
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load locations.'))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  function parentName(location: Location): string {
    if (location.parentLocationId == null || !locations) return '—'
    return locations.find((l) => l.id === location.parentLocationId)?.name ?? '—'
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createLocation({
        name: newName.trim(),
        type: newType,
        parentLocationId: newParentId === NO_PARENT ? undefined : Number(newParentId),
        address: newAddress.trim() || undefined,
      })
      setNewName('')
      setNewAddress('')
      setNewParentId(NO_PARENT)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create location.'))
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(location: Location) {
    setEditingId(location.id)
    setEditName(location.name)
  }

  async function saveEdit(id: number) {
    setError(null)
    try {
      await updateLocation(id, { name: editName.trim() })
      setEditingId(null)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update location.'))
    }
  }

  async function handleDelete(location: Location) {
    if (!confirm(`Delete "${location.name}"? Its sub-locations will move to the top level.`)) return
    setError(null)
    try {
      await deleteLocation(location.id)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not delete location — it may still hold stock.'))
    }
  }

  return (
    <>
      <h1>Locations</h1>
      <p className="subtitle">Warehouses, branches, aisles, and shelves — where stock physically lives.</p>

      <form className="inline-form" onSubmit={(e) => void handleCreate(e)}>
        <div className="field">
          <label htmlFor="loc-name">Name</label>
          <input id="loc-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="loc-type">Type</label>
          <select
            id="loc-type"
            value={newType}
            onChange={(e) => setNewType(e.target.value as LocationType)}
          >
            {LOCATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="loc-parent">Parent location</label>
          <select id="loc-parent" value={newParentId} onChange={(e) => setNewParentId(e.target.value)}>
            <option value={NO_PARENT}>None (top level)</option>
            {locations?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="loc-address">Address</label>
          <input id="loc-address" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting || !newName.trim()}>
          Add location
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      {locations === null ? (
        <p>Loading…</p>
      ) : locations.length === 0 ? (
        <div className="empty-state">No locations yet — add one above to get started.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Parent</th>
              <th>Address</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => (
              <tr key={location.id}>
                <td>
                  {editingId === location.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  ) : (
                    location.name
                  )}
                </td>
                <td>{location.type}</td>
                <td>{parentName(location)}</td>
                <td>{location.address ?? '—'}</td>
                <td className="row-actions">
                  {editingId === location.id ? (
                    <>
                      <button className="btn btn-primary" onClick={() => void saveEdit(location.id)}>
                        Save
                      </button>
                      <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary" onClick={() => startEdit(location)}>
                        Rename
                      </button>
                      <button className="btn btn-danger" onClick={() => void handleDelete(location)}>
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
