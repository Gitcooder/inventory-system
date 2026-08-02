// Single source of truth for "which panel does this role own" — used after
// login and by ProtectedRoute when bouncing someone back to where they belong.
export function homePathForRoles(roles: string[]): string {
  if (roles.includes('Admin')) return '/admin'
  if (roles.includes('Employee')) return '/staff'
  if (roles.includes('Customer')) return '/shop'
  return '/'
}
