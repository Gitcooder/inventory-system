import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

export default function ShopLayout() {
  const { status, user, hasRole, logout } = useAuth()
  const isCustomer = status === 'authenticated' && hasRole('Customer')

  return (
    <div className="shop-shell">
      <header className="shop-header">
        <Link to="/shop" className="brand">
          The Store
        </Link>
        <nav>
          {isCustomer ? (
            <>
              <span>{user?.name}</span>
              <button onClick={() => void logout()}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              <Link to="/register">Create account</Link>
            </>
          )}
        </nav>
      </header>
      <main className="shop-main">
        <Outlet />
      </main>
    </div>
  )
}
