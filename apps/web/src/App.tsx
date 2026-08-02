import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './routes/auth/LoginPage'
import RegisterPage from './routes/auth/RegisterPage'
import AdminLayout from './routes/admin/AdminLayout'
import AdminDashboard from './routes/admin/AdminDashboard'
import AlertsPage from './routes/admin/AlertsPage'
import ReviewsModerationPage from './routes/admin/ReviewsModerationPage'
import ProductDetailPage from './routes/admin/ProductDetailPage'
import AuditLogPage from './routes/admin/AuditLogPage'
import ReportsPage from './routes/admin/ReportsPage'
import BrandsPage from './routes/admin/catalog/BrandsPage'
import CategoriesPage from './routes/admin/catalog/CategoriesPage'
import LocationsPage from './routes/admin/catalog/LocationsPage'
import ProductsPage from './routes/admin/catalog/ProductsPage'
import StockPage from './routes/admin/inventory/StockPage'
import StaffHome from './routes/staff/StaffHome'
import ShopLayout from './routes/shop/ShopLayout'
import ShopHome from './routes/shop/ShopHome'
import ShopProductDetail from './routes/shop/ShopProductDetail'
import ProtectedRoute from './auth/ProtectedRoute'
import { useAuth } from './auth/AuthContext'
import { homePathForRoles } from './auth/homePath'
import './App.css'

function Landing() {
  const { status, user } = useAuth()
  if (status === 'loading') return <div className="panel"><p>Loading…</p></div>
  if (status === 'authenticated' && user) {
    return <Navigate to={homePathForRoles(user.roles)} replace />
  }
  // Anonymous visitors land on the public storefront, not a login wall —
  // browsing the catalog never requires an account (see Phase 6 / products
  // being @Public() on the API side). Only Admin/Employee panels need auth
  // up front, which is why they still go through ProtectedRoute below.
  return <Navigate to="/shop" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute role="Admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:id" element={<ProductDetailPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="reviews" element={<ReviewsModerationPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="audit-log" element={<AuditLogPage />} />
        <Route path="brands" element={<BrandsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="locations" element={<LocationsPage />} />
      </Route>

      <Route
        path="/staff/*"
        element={
          <ProtectedRoute role="Employee">
            <StaffHome />
          </ProtectedRoute>
        }
      />

      {/* Public — no ProtectedRoute. Browsing and reading reviews never
          requires an account; ShopProductDetail itself gates the "submit a
          review" form behind being signed in as a Customer. */}
      <Route path="/shop" element={<ShopLayout />}>
        <Route index element={<ShopHome />} />
        <Route path="products/:id" element={<ShopProductDetail />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
