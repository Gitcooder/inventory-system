import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { homePathForRoles } from './homePath'

export default function ProtectedRoute({
  role,
  children,
}: {
  role: string
  children: ReactNode
}) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="panel">
        <p>Loading…</p>
      </div>
    )
  }

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Authenticated, but this isn't their panel — send them to the one that is,
  // rather than showing a bare 403. Separation of duties is enforced by the
  // API regardless; this is just UX so nobody lands on a screen that only
  // ever 403s for them.
  if (!user.roles.includes(role)) {
    return <Navigate to={homePathForRoles(user.roles)} replace />
  }

  return <>{children}</>
}
