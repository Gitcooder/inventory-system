import { useAlerts } from './AlertsContext'

export default function AlertToastContainer() {
  const { toasts, dismissToast } = useAlerts()

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" role="region" aria-label="Low stock alerts">
      {toasts.map((t) => (
        <div key={t.toastId} className="toast" role="alert">
          <div className="toast-body">
            <strong>Low stock</strong>
            <span>
              {t.productName} at {t.locationName} — {t.quantity} left (threshold {t.thresholdLimit})
            </span>
          </div>
          <button
            className="toast-dismiss"
            onClick={() => dismissToast(t.toastId)}
            aria-label="Dismiss alert"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
