import { api } from './api'
import type { Product, Location, Paginated } from './catalog'

export interface AlertLogEntry {
  id: number
  productId: number
  locationId: number
  stockAtTrigger: number
  thresholdAtTrigger: number
  triggeredAt: string
  acknowledgedAt: string | null
  product: Product
  location: Location
  acknowledgedBy: { id: number; name: string; email: string } | null
}

export interface AlertsQuery {
  productId?: number
  locationId?: number
  acknowledged?: boolean
  page?: number
  pageSize?: number
}

export const listAlerts = (query: AlertsQuery) =>
  api.get<Paginated<AlertLogEntry>>('/alerts', { params: query }).then((r) => r.data)

export const acknowledgeAlert = (id: number) =>
  api.patch<AlertLogEntry>(`/alerts/${id}/acknowledge`).then((r) => r.data)
