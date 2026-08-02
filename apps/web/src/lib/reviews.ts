import { api } from './api'
import type { Paginated, Product } from './catalog'

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface PublicReview {
  id: number
  productId: number
  rating: number
  reviewText: string | null
  status: ReviewStatus
  createdAt: string
  customer: { id: number; name: string }
}

export interface ModerationReview {
  id: number
  productId: number
  rating: number
  reviewText: string | null
  status: ReviewStatus
  createdAt: string
  product: Product
  customer: { id: number; name: string; email: string }
}

export const listPublicReviews = (productId: number, page = 1) =>
  api.get<Paginated<PublicReview>>('/reviews', { params: { productId, page, pageSize: 20 } }).then((r) => r.data)

export const submitReview = (dto: { productId: number; rating: number; reviewText?: string }) =>
  api.post<PublicReview>('/reviews', dto).then((r) => r.data)

export const listModerationQueue = (status: ReviewStatus = 'pending', page = 1) =>
  api
    .get<Paginated<ModerationReview>>('/reviews/moderation', { params: { status, page, pageSize: 20 } })
    .then((r) => r.data)

export const moderateReview = (id: number, status: 'approved' | 'rejected') =>
  api.patch<ModerationReview>(`/reviews/${id}/moderate`, { status }).then((r) => r.data)
