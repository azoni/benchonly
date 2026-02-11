import { db } from './firebase'
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  serverTimestamp,
  limit,
  Timestamp
} from 'firebase/firestore'

// ============ ANALYTICS SERVICE ============
// Tracks user activity for admin insights

export const analyticsService = {
  // Log a user action
  async logAction(userId, action, metadata = {}) {
    if (!userId) return
    
    try {
      // Strip undefined values — Firestore rejects them
      const cleanMeta = Object.fromEntries(
        Object.entries(metadata).filter(([_, v]) => v !== undefined)
      )
      await addDoc(collection(db, 'analytics'), {
        userId,
        action,
        metadata: cleanMeta,
        timestamp: serverTimestamp(),
        userAgent: navigator.userAgent,
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
      })
    } catch (error) {
      // Silently fail - don't break the app for analytics
      console.error('Analytics error:', error)
    }
  },

  // Log page view
  async logPageView(userId, page, metadata = {}) {
    return this.logAction(userId, 'page_view', { page, ...metadata })
  },

  // Get activity summary for admin
  async getActivitySummary(days = 7) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    
    const q = query(
      collection(db, 'analytics'),
      where('timestamp', '>=', Timestamp.fromDate(startDate)),
      orderBy('timestamp', 'desc')
    )
    
    const snapshot = await getDocs(q)
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    
    // Aggregate stats
    const uniqueUsers = new Set(events.map(e => e.userId))
    const actionCounts = {}
    const pageCounts = {}
    const dailyActive = {}
    const userActivity = {}
    
    events.forEach(event => {
      // Count actions
      actionCounts[event.action] = (actionCounts[event.action] || 0) + 1
      
      // Count page views
      if (event.action === 'page_view' && event.metadata?.page) {
        pageCounts[event.metadata.page] = (pageCounts[event.metadata.page] || 0) + 1
      }
      
      // Daily active users
      const date = event.timestamp?.toDate?.()
      if (date) {
        const dateKey = date.toISOString().split('T')[0]
        if (!dailyActive[dateKey]) dailyActive[dateKey] = new Set()
        dailyActive[dateKey].add(event.userId)
      }
      
      // Per-user activity
      if (!userActivity[event.userId]) {
        userActivity[event.userId] = { actions: 0, lastSeen: null }
      }
      userActivity[event.userId].actions++
      if (!userActivity[event.userId].lastSeen || 
          (event.timestamp?.toDate?.() > userActivity[event.userId].lastSeen)) {
        userActivity[event.userId].lastSeen = event.timestamp?.toDate?.()
      }
    })
    
    // Convert daily active sets to counts
    const dailyActiveCounts = Object.entries(dailyActive).map(([date, users]) => ({
      date,
      count: users.size
    })).sort((a, b) => a.date.localeCompare(b.date))
    
    return {
      totalEvents: events.length,
      uniqueUsers: uniqueUsers.size,
      actionCounts,
      pageCounts,
      dailyActiveCounts,
      userActivity,
      recentEvents: events.slice(0, 50)
    }
  },

  // Get activity for a specific user
  async getUserActivity(userId, limitCount = 50) {
    const q = query(
      collection(db, 'analytics'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    )
    
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  },

  // Get recent activity across all users
  async getRecentActivity(limitCount = 100) {
    const q = query(
      collection(db, 'analytics'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    )
    
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  }
}

// Action types for consistency
export const ACTIONS = {
  PAGE_VIEW: 'page_view',
  WORKOUT_CREATED: 'workout_created',
  WORKOUT_COMPLETED: 'workout_completed',
  GOAL_CREATED: 'goal_created',
  GOAL_COMPLETED: 'goal_completed',
  CARDIO_LOGGED: 'cardio_logged',
  HEALTH_LOGGED: 'health_logged',
  AI_CHAT: 'ai_chat',
  LOGIN: 'login',
  SIGNUP: 'signup',
}
