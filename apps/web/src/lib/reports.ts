import { api } from './api'

export interface UsageSummaryRow {
  productId: number
  productName: string
  skuCode: string
  timesDispensed: number
  totalQuantityDispensed: number
}

export interface UsageSummaryQuery {
  from?: string
  to?: string
}

export const getUsageSummary = (query: UsageSummaryQuery) =>
  api.get<UsageSummaryRow[]>('/reports/usage-summary', { params: query }).then((r) => r.data)

/**
 * The export endpoint returns a real file download (Content-Disposition:
 * attachment), so this can't just be a JSON GET like the others — it fetches
 * the CSV as a blob and triggers a browser download via a throwaway link,
 * the standard pattern for downloading an authenticated file with fetch/axios
 * (a plain <a href> can't attach the Authorization header).
 */
export async function downloadUsageSummaryCsv(query: UsageSummaryQuery): Promise<void> {
  const response = await api.get('/reports/usage-summary/export', {
    params: query,
    responseType: 'blob',
  })
  const url = URL.createObjectURL(new Blob([response.data as BlobPart], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'usage-summary.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
