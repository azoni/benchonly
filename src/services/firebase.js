import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration - Replace with your actual config
const firebaseConfig = {
  apiKey: "AIzaSyDV6I7Z6uGqgT8EPwTR3dr2w2xo6aoWqI4",
  authDomain: "benchonly-7d92a.firebaseapp.com",
  projectId: "benchonly-7d92a",
  storageBucket: "benchonly-7d92a.firebasestorage.app",
  messagingSenderId: "461193748919",
  appId: "1:461193748919:web:4268cfef7783562e374832"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Auth — use IndexedDB persistence first (faster & more reliable in WKWebView/Capacitor)
// Falls back to localStorage for web browsers that don't support IndexedDB
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Firestore
export const db = getFirestore(app);

export default app;
