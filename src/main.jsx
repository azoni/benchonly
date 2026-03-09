import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './index.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

// PWA service worker: only run in browser, NEVER inside Capacitor native app.
// Service workers intercept Capacitor's local file serving and can deadlock the app on launch.
const isNativeApp = !!(window.Capacitor?.isNativePlatform?.())

if ('serviceWorker' in navigator) {
  if (isNativeApp) {
    // Native: unregister any stale service workers left from previous builds
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(reg => reg.unregister())
    })
  } else {
    // Web: register SW manually (injectRegister is disabled in vite config)
    import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({ immediate: true })
    }).catch(() => {})

    // Check for updates when user switches back to app
    const checkForUpdate = () => {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) reg.update().catch(() => {})
      })
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    })

    setInterval(checkForUpdate, 5 * 60 * 1000)

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }
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