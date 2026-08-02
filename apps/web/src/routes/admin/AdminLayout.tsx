import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/alerts', label: 'Alerts' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/stock', label: 'Stock' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/audit-log', label: 'Audit Log' },
  { to: '/admin/brands', label: 'Brands' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/locations', label: 'Locations' },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <h2>Admin</h2>
        <nav className="admin-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <div>{user?.name}</div>
          <div>{user?.email}</div>
          <button onClick={() => void logout()}>Log out</button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
