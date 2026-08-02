import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { findProductById, type Product } from '../../lib/catalog'
import { listPublicReviews, submitReview, type PublicReview } from '../../lib/reviews'
import { useAuth } from '../../auth/AuthContext'
import { apiErrorMessage } from '../../lib/errors'

function Stars({ rating }: { rating: number }) {
  return (
    <span className="rating-stars" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  )
}

export default function ShopProductDetail() {
  const { id } = useParams<{ id: string }>()
  const productId = Number(id)
  const { status, hasRole } = useAuth()
  const canReview = status === 'authenticated' && hasRole('Customer')

  const [product, setProduct] = useState<Product | null>(null)
  const [reviews, setReviews] = useState<PublicReview[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [rating, setRating] = useState('5')
  const [reviewText, setReviewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refreshReviews = useCallback(async () => {
    try {
      const result = await listPublicReviews(productId)
      setReviews(result.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load reviews.'))
    }
  }, [productId])

  useEffect(() => {
    if (!Number.isFinite(productId)) return
    void findProductById(productId).then(setProduct).catch(() => setProduct(null))
    void refreshReviews()
  }, [productId, refreshReviews])

  async function handleSubmitReview(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      await submitReview({ productId, rating: Number(rating), reviewText: reviewText.trim() || undefined })
      setNotice('Thanks — your review is queued for moderation and will appear once approved.')
      setReviewText('')
      await refreshReviews()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not submit your review.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (product === null) {
    return <p>Loading…</p>
  }

  return (
    <>
      <Link to="/shop" style={{ fontSize: '0.85rem' }}>
        ← Back to products
      </Link>
      <h1 style={{ marginTop: 'var(--space-3)' }}>{product.name}</h1>
      <p className="subtitle">
        {product.brand.name} · {product.category.name} · <span className="sku">{product.skuCode}</span>
      </p>
      {product.usesDescription && <p>{product.usesDescription}</p>}

      <h1 style={{ fontSize: '1.1rem', marginTop: 'var(--space-6)' }}>Reviews</h1>

      {canReview ? (
        <form className="inline-form" onSubmit={(e) => void handleSubmitReview(e)}>
          <div className="field">
            <label htmlFor="r-rating">Rating</label>
            <select id="r-rating" value={rating} onChange={(e) => setRating(e.target.value)}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} star{n === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 240 }}>
            <label htmlFor="r-text">Your review (optional)</label>
            <input id="r-text" value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            Submit review
          </button>
        </form>
      ) : (
        <p className="subtitle">
          <Link to="/login">Sign in</Link> or <Link to="/register">create an account</Link> to leave a review.
        </p>
      )}

      {notice && (
        <p className="subtitle" style={{ color: 'var(--color-accent)' }}>
          {notice}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}

      {reviews === null ? (
        <p>Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <div className="empty-state">No reviews yet — be the first.</div>
      ) : (
        <div className="review-list">
          {reviews.map((r) => (
            <div key={r.id} className="review-item">
              <div className="review-meta">
                <span>{r.customer.name}</span>
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              <Stars rating={r.rating} />
              {r.reviewText && <p style={{ margin: 'var(--space-1) 0 0' }}>{r.reviewText}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
