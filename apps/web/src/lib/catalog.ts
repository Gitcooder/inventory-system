import { api } from './api'

export interface Brand {
  id: number
  name: string
}

export interface Category {
  id: number
  name: string
  description: string | null
  parentCategoryId: number | null
}

export interface CategoryNode extends Category {
  children: CategoryNode[]
}

export const LOCATION_TYPES = ['warehouse', 'branch', 'aisle', 'shelf'] as const
export type LocationType = (typeof LOCATION_TYPES)[number]

export interface Location {
  id: number
  name: string
  type: LocationType
  parentLocationId: number | null
  address: string | null
}

export interface LocationNode extends Location {
  children: LocationNode[]
}

export interface Product {
  id: number
  skuCode: string
  name: string
  brandId: number
  categoryId: number
  usesDescription: string | null
  unitOfMeasure: string | null
  isActive: boolean
  brand: Brand
  category: Category
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface ProductQuery {
  q?: string
  brandId?: number
  categoryId?: number
  isActive?: boolean
  page?: number
  pageSize?: number
}

// --- Brands ---
export const listBrands = () => api.get<Brand[]>('/brands').then((r) => r.data)
export const createBrand = (name: string) => api.post<Brand>('/brands', { name }).then((r) => r.data)
export const updateBrand = (id: number, name: string) =>
  api.patch<Brand>(`/brands/${id}`, { name }).then((r) => r.data)
export const deleteBrand = (id: number) => api.delete(`/brands/${id}`).then(() => undefined)

// --- Categories ---
export const listCategories = () => api.get<Category[]>('/categories').then((r) => r.data)
export const createCategory = (dto: {
  name: string
  description?: string
  parentCategoryId?: number
}) => api.post<Category>('/categories', dto).then((r) => r.data)
export const updateCategory = (
  id: number,
  dto: Partial<{ name: string; description: string; parentCategoryId: number | null }>,
) => api.patch<Category>(`/categories/${id}`, dto).then((r) => r.data)
export const deleteCategory = (id: number) => api.delete(`/categories/${id}`).then(() => undefined)

// --- Locations ---
export const listLocations = () => api.get<Location[]>('/locations').then((r) => r.data)
export const createLocation = (dto: {
  name: string
  type: LocationType
  parentLocationId?: number
  address?: string
}) => api.post<Location>('/locations', dto).then((r) => r.data)
export const updateLocation = (
  id: number,
  dto: Partial<{ name: string; type: LocationType; parentLocationId: number | null; address: string }>,
) => api.patch<Location>(`/locations/${id}`, dto).then((r) => r.data)
export const deleteLocation = (id: number) => api.delete(`/locations/${id}`).then(() => undefined)

// --- Products ---
export interface ProductDetails {
  product: Product
  stockByLocation: { id: number; locationId: number; quantity: number; thresholdLimit: number; batchNumber: string; location: Location }[]
  totalStock: number
  usageSummary: { timesDispensed: number; totalQuantityDispensed: number }
  usageLedger: {
    id: number
    quantityUsed: number
    purposeDescription: string | null
    timestamp: string
    user: { id: number; name: string }
    location: Location
  }[]
  adjustmentLedger: {
    id: number
    adjustmentType: string
    quantityChange: number
    reason: string | null
    timestamp: string
    adjustedBy: { id: number; name: string }
    location: Location
  }[]
  reviewSummary: { approvedCount: number; averageRating: number | null }
}

export const getProductDetails = (id: number) =>
  api.get<ProductDetails>(`/products/${id}/details`).then((r) => r.data)

export const listProducts = (query: ProductQuery) =>
  api.get<Paginated<Product>>('/products', { params: query }).then((r) => r.data)
export const findProductById = (id: number) => api.get<Product>(`/products/${id}`).then((r) => r.data)
export const findProductBySku = (skuCode: string) =>
  api.get<Product>(`/products/sku/${encodeURIComponent(skuCode)}`).then((r) => r.data)
export const createProduct = (dto: {
  skuCode: string
  name: string
  brandId: number
  categoryId: number
  usesDescription?: string
  unitOfMeasure?: string
}) => api.post<Product>('/products', dto).then((r) => r.data)
export const updateProduct = (
  id: number,
  dto: Partial<{
    skuCode: string
    name: string
    brandId: number
    categoryId: number
    usesDescription: string
    unitOfMeasure: string
  }>,
) => api.patch<Product>(`/products/${id}`, dto).then((r) => r.data)
export const setProductStatus = (id: number, isActive: boolean) =>
  api.patch<Product>(`/products/${id}/status`, { isActive }).then((r) => r.data)
