import { api } from './api'
import type { Product, Location, Paginated } from './catalog'

export const ADJUSTMENT_TYPES = ['restock', 'correction', 'damage', 'expired'] as const
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number]

export interface InventoryStock {
  id: number
  productId: number
  locationId: number
  quantity: number
  thresholdLimit: number
  batchNumber: string
  expirationDate: string | null
  product: Product
  location: Location
}

export interface StockAdjustment {
  id: number
  productId: number
  locationId: number
  batchNumber: string
  adjustmentType: AdjustmentType
  quantityChange: number
  reason: string | null
  timestamp: string
  adjustedBy: { id: number; name: string; email: string }
}

export interface InventoryQuery {
  productId?: number
  locationId?: number
  lowStockOnly?: boolean
  page?: number
  pageSize?: number
}

export const listInventory = (query: InventoryQuery) =>
  api.get<Paginated<InventoryStock>>('/inventory', { params: query }).then((r) => r.data)

export const updateStockThreshold = (id: number, thresholdLimit: number) =>
  api.patch<InventoryStock>(`/inventory/${id}/threshold`, { thresholdLimit }).then((r) => r.data)

export const adjustStock = (dto: {
  productId: number
  locationId: number
  batchNumber?: string
  adjustmentType: AdjustmentType
  quantityChange: number
  reason?: string
}) =>
  api
    .post<{ stock: InventoryStock; adjustment: StockAdjustment }>('/inventory/adjustments', dto)
    .then((r) => r.data)

export const listStockHistory = (stockId: number, page = 1) =>
  api
    .get<Paginated<StockAdjustment>>(`/inventory/${stockId}/adjustments`, { params: { page, pageSize: 10 } })
    .then((r) => r.data)
