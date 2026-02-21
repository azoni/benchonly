import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, limit as fbLimit, serverTimestamp, increment, updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import { getAuthHeaders } from './api'
import { API_BASE } from '../utils/platform'

export const socialService = {
  // ─── Settings ───
  async getSettings() {
    const snap = await getDoc(doc(db, 'settings', 'social'))
    if (!snap.exists()) return null
    return snap.data()
  },

  async saveSettings(settings) {
    await setDoc(doc(db, 'settings', 'social'), {
      ...settings,
      updatedAt: serverTimestamp(),
    })
  },

  // ─── Threads ───
  async getThreads(statusFilter = null, limitCount = 50) {
    let q
    if (statusFilter) {
      q = query(
        collection(db, 'socialThreads'),
        where('status', '==', statusFilter),
        orderBy('createdAt', 'desc'),
        fbLimit(limitCount)
      )
    } else {
      q = query(
        collection(db, 'socialThreads'),
        orderBy('createdAt', 'desc'),
        fbLimit(limitCount)
      )
    }
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  },

  async deleteThread(threadId) {
    await deleteDoc(doc(db, 'socialThreads', threadId))
  },

  async retryThread(threadId) {
    await updateDoc(doc(db, 'socialThreads', threadId), {
      status: 'queued',
      error: null,
      updatedAt: serverTimestamp(),
    })
  },

  // ─── Actions (call Netlify functions) ───
  async generateThread(options = {}) {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}/generate-social-thread`, {
      method: 'POST',
      headers,
      body: JSON.stringify(options),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Generation failed')
    }
    return res.json()
  },

  async postThread(threadId) {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}/post-social-thread`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ threadId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Posting failed')
    }
    return res.json()
  },

  // ─── Stats ───
  async getStats() {
    const threads = await this.getThreads(null, 200)
    const posted = threads.filter(t => t.status === 'posted')

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayPosts = posted.filter(t => {
      const ts = t.postedAt?.toDate?.() || t.createdAt?.toDate?.()
      return ts && ts >= today
    })

    return {
      postsToday: todayPosts.length,
      totalPosted: posted.length,
      queued: threads.filter(t => t.status === 'queued').length,
      failed: threads.filter(t => t.status === 'failed').length,
      totalImpressions: posted.reduce((s, t) => s + (t.impressions || 0), 0),
      totalLikes: posted.reduce((s, t) => s + (t.likes || 0), 0),
      totalRetweets: posted.reduce((s, t) => s + (t.retweets || 0), 0),
    }
  },
}
