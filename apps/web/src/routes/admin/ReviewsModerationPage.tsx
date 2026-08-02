import { useCallback, useEffect, useState } from 'react'
import {
  type ModerationReview,
  type ReviewStatus,
  listModerationQueue,
  moderateReview,
} from '../../lib/reviews'
import { apiErrorMessage } from '../../lib/errors'

function Stars({ rating }: { rating: number }) {
  return (
    <span className="rating-stars">
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  )
}

export default function ReviewsModerationPage() {
  const [status, setStatus] = useState<ReviewStatus>('pending')
  const [reviews, setReviews] = useState<ModerationReview[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await listModerationQueue(status)
      setReviews(result.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load the moderation queue.'))
    }
  }, [status])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleModerate(id: number, next: 'approved' | 'rejected') {
    setError(null)
    try {
      await moderateReview(id, next)
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update this review.'))
    }
  }

  return (
    <>
      <h1>Review moderation</h1>
      <p className="subtitle">Reviews only appear on the storefront once approved here.</p>

      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value as ReviewStatus)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}

      {reviews === null ? (
        <p>Loading…</p>
      ) : reviews.length === 0 ? (
        <div className="empty-state">Nothing here right now.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Rating</th>
              <th>Review</th>
              <th>Customer</th>
              <th>Submitted</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id}>
                <td className="sku">
                  {r.product.skuCode} — {r.product.name}
                </td>
                <td>
                  <Stars rating={r.rating} />
                </td>
                <td>{r.reviewText ?? '—'}</td>
                <td>
                  {r.customer.name} ({r.customer.email})
                </td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="row-actions">
                  {status === 'pending' && (
                    <>
                      <button className="btn btn-primary" onClick={() => void handleModerate(r.id, 'approved')}>
                        Approve
                      </button>
                      <button className="btn btn-danger" onClick={() => void handleModerate(r.id, 'rejected')}>
                        Reject
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
