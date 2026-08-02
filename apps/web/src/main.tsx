import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { AlertsProvider } from './alerts/AlertsContext.tsx'
import AlertToastContainer from './alerts/AlertToastContainer.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AlertsProvider>
          <App />
          <AlertToastContainer />
        </AlertsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
