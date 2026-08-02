import { AxiosError } from 'axios'

/** The Nest ValidationPipe / HttpException shape: { message: string | string[], ... } */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof AxiosError) {
    const body = err.response?.data as { message?: string | string[] } | undefined
    if (Array.isArray(body?.message)) return body.message.join(' ')
    if (typeof body?.message === 'string') return body.message
  }
  return fallback
}
