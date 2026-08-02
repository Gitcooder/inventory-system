import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/AuthContext'
import { alertSocket } from '../lib/socket'

export interface LowStockAlert {
  alertId: number
  productId: number
  productName: string
  locationId: number
  locationName: string
  quantity: number
  thresholdLimit: number
  triggeredAt: string
}

interface Toast extends LowStockAlert {
  toastId: string
}

interface AlertsContextValue {
  toasts: Toast[]
  dismissToast: (toastId: string) => void
}

const AlertsContext = createContext<AlertsContextValue | undefined>(undefined)

const TOAST_AUTO_DISMISS_MS = 10_000

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { status, hasRole } = useAuth()
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
  }, [])

  useEffect(() => {
    // The gateway rejects any handshake without 'stock:view' anyway (see
    // alerts.gateway.ts) — Customer accounts don't hold it, so skip opening
    // a socket that would just be refused.
    const canReceiveAlerts = status === 'authenticated' && (hasRole('Admin') || hasRole('Employee'))
    if (!canReceiveAlerts) {
      alertSocket.disconnect()
      return
    }

    alertSocket.connect()

    function handleAlert(payload: LowStockAlert) {
      const toastId = `${payload.alertId}-${Date.now()}`
      setToasts((prev) => [...prev, { ...payload, toastId }])
      setTimeout(() => dismissToast(toastId), TOAST_AUTO_DISMISS_MS)
    }

    alertSocket.on('low_stock_alert', handleAlert)
    return () => {
      alertSocket.off('low_stock_alert', handleAlert)
    }
  }, [status, hasRole, dismissToast])

  // Belt-and-suspenders cleanup on unmount (e.g. hot reload in dev).
  useEffect(() => {
    return () => {
      alertSocket.disconnect()
    }
  }, [])

  return (
    <AlertsContext.Provider value={{ toasts, dismissToast }}>{children}</AlertsContext.Provider>
  )
}

export function useAlerts() {
  const ctx = useContext(AlertsContext)
  if (!ctx) throw new Error('useAlerts must be used within an AlertsProvider')
  return ctx
}
