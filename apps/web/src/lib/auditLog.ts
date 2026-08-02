import { api } from './api'
import type { Paginated } from './catalog'

export interface AuditLogEntry {
  id: number
  userId: number | null
  action: string
  entityType: string
  entityId: number | null
  oldValue: unknown
  newValue: unknown
  ipAddress: string | null
  timestamp: string
  user: { id: number; name: string; email: string } | null
}

export interface AuditLogQuery {
  action?: string
  entityType?: string
  userId?: number
  page?: number
  pageSize?: number
}

export const listAuditLog = (query: AuditLogQuery) =>
  api.get<Paginated<AuditLogEntry>>('/audit-log', { params: query }).then((r) => r.data)
