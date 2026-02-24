import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './index.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

// PWA auto-update: only run in browser, not inside Capacitor native app
const isNativeApp = !!(window.Capacitor?.isNativePlatform?.())
if ('serviceWorker' in navigator && !isNativeApp) {
  // vite-plugin-pwa handles initial registration; we add update triggers
  const checkForUpdate = () => {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) reg.update().catch(() => {})
    })
  }

  // Check when user switches back to app (from home screen, tab switch, etc.)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })

  // Also check every 5 minutes while active
  setInterval(checkForUpdate, 5 * 60 * 1000)

  // When a new SW takes over, reload to use updated code
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)