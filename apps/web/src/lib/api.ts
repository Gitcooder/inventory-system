import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

// Central HTTP client. Access token lives only in memory (module-level, set by
// AuthContext) — never localStorage/sessionStorage, so it can't be lifted by
// an XSS payload. The refresh token is a separate httpOnly cookie the browser
// sends automatically (`withCredentials: true`); JS never touches it directly.

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  withCredentials: true,
})

let accessToken: string | null = null
export function setAccessToken(token: string | null) {
  accessToken = token
}
export function getAccessToken() {
  return accessToken
}

// AuthContext registers this so the interceptor can drop the user back to
// "logged out" state without importing React stuff into this module.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined
    const isAuthEndpoint = config?.url?.startsWith('/auth/')

    if (error.response?.status === 401 && config && !config._retry && !isAuthEndpoint) {
      config._retry = true
      try {
        const { data } = await api.post<{ accessToken: string }>('/auth/refresh')
        setAccessToken(data.accessToken)
        config.headers.Authorization = `Bearer ${data.accessToken}`
        return api(config)
      } catch (refreshError) {
        setAccessToken(null)
        onUnauthorized?.()
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)
