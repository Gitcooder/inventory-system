import { api } from './api'
import type { Product, Location, Paginated } from './catalog'
import type { InventoryStock } from './inventory'

export interface UsageLog {
  id: number
  productId: number
  userId: number
  locationId: number
  quantityUsed: number
  purposeDescription: string | null
  timestamp: string
  product: Product
  location: Location
  user: { id: number; name: string; email: string }
}

export interface DispenseQuery {
  productId?: number
  userId?: number
  locationId?: number
  page?: number
  pageSize?: number
}

export const listUsageLogs = (query: DispenseQuery) =>
  api.get<Paginated<UsageLog>>('/dispense', { params: query }).then((r) => r.data)

export const dispenseProduct = (dto: {
  productId: number
  locationId: number
  batchNumber?: string
  quantityUsed: number
  purposeDescription?: string
}) =>
  api
    .post<{ stock: InventoryStock; usageLog: UsageLog }>('/dispense', dto)
    .then((r) => r.data)
