import '@testing-library/jest-dom'

// Mock Firebase
vi.mock('../services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user', email: 'test@test.com', getIdToken: () => Promise.resolve('mock-token') } },
  storage: {},
}))

// Mock firebase/auth
vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    currentUser: { uid: 'test-user', email: 'test@test.com', getIdToken: () => Promise.resolve('mock-token') },
  }),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: vi.fn(),
}))

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  Timestamp: { fromDate: (d) => ({ toDate: () => d, seconds: d.getTime() / 1000 }) },
}))

// Mock firebase/storage
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}))
