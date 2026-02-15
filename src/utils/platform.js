/**
 * Platform detection for Capacitor native vs web.
 * 
 * On web (benchpressonly.com): API calls use relative URLs (/.netlify/functions/...)
 * On native (Capacitor):       API calls must use absolute URLs (https://benchpressonly.com/.netlify/functions/...)
 * 
 * Usage:
 *   import { API_BASE, isNative } from '../utils/platform'
 *   fetch(`${API_BASE}/generate-workout`, { ... })
 */

let _isNative = false

try {
  // Capacitor sets window.Capacitor when running in a native shell
  _isNative = !!window?.Capacitor?.isNativePlatform?.()
} catch {
  _isNative = false
}

export const isNative = _isNative
export const isIOS = _isNative && window?.Capacitor?.getPlatform?.() === 'ios'
export const isAndroid = _isNative && window?.Capacitor?.getPlatform?.() === 'android'
export const isWeb = !_isNative

// API base URL — relative on web, absolute on native
const PROD_URL = 'https://benchpressonly.com'
export const API_BASE = _isNative ? `${PROD_URL}/.netlify/functions` : '/.netlify/functions'

/**
 * Build a full API URL for a Netlify function.
 * @param {string} functionName — e.g. 'generate-workout', 'analyze-form'
 * @returns {string} — full URL
 */
export function apiUrl(functionName) {
  return `${API_BASE}/${functionName}`
}
