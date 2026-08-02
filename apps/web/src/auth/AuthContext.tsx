import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { api, setAccessToken, setUnauthorizedHandler } from '../lib/api'

export interface CurrentUser {
  id: number
  name: string
  email: string
  roles: string[]
}

type Status = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  status: Status
  user: CurrentUser | null
  login: (email: string, password: string) => Promise<CurrentUser>
  register: (dto: { name: string; email: string; password: string; phone?: string }) => Promise<CurrentUser>
  logout: () => Promise<void>
  hasRole: (role: string) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<CurrentUser | null>(null)

  const clearAuth = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  // On first load there's no access token in memory yet (page refresh wipes
  // it), but the httpOnly refresh cookie may still be valid — try to silently
  // trade it for a new access token before deciding the user is logged out.
  useEffect(() => {
    setUnauthorizedHandler(clearAuth)
    let cancelled = false

    async function silentRefresh() {
      try {
        const { data } = await api.post<{ accessToken: string }>('/auth/refresh')
        setAccessToken(data.accessToken)
        const me = await api.get<CurrentUser>('/users/me')
        if (!cancelled) {
          setUser(me.data)
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) clearAuth()
      }
    }

    void silentRefresh()
    return () => {
      cancelled = true
      setUnauthorizedHandler(null)
    }
  }, [clearAuth])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ accessToken: string; user: CurrentUser }>(
      '/auth/login',
      { email, password },
    )
    setAccessToken(data.accessToken)
    setUser(data.user)
    setStatus('authenticated')
    return data.user
  }, [])

  const register = useCallback(
    async (dto: { name: string; email: string; password: string; phone?: string }) => {
      const { data } = await api.post<{ accessToken: string; user: CurrentUser }>(
        '/auth/register',
        dto,
      )
      setAccessToken(data.accessToken)
      setUser(data.user)
      setStatus('authenticated')
      return data.user
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      clearAuth()
    }
  }, [clearAuth])

  const hasRole = useCallback((role: string) => user?.roles.includes(role) ?? false, [user])

  return (
    <AuthContext.Provider value={{ status, user, login, register, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
