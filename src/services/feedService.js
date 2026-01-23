import { db } from './firebase'
import { 
  collection, 
  addDoc, 
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment
} from 'firebase/firestore'

// ============ FEED SERVICE ============
// Handles social feed, comments, and reactions

export const feedService = {
  // Create a feed item when user does something
  async createFeedItem(userId, type, data) {
    try {
      const docRef = await addDoc(collection(db, 'feed'), {
        userId,
        type, // 'workout', 'cardio', 'goal_completed', 'goal_created', 'streak'
        data, // { workoutId, workoutName, exerciseCount, etc. }
        reactions: {},  // { '💪': ['userId1', 'userId2'], '🔥': ['userId3'] }
        reactionCount: 0,
        commentCount: 0,
        createdAt: serverTimestamp(),
      })
      return { id: docRef.id }
    } catch (error) {
      console.error('Error creating feed item:', error)
      throw error
    }
  },

  // Get feed items (with pagination)
  async getFeed(limitCount = 20, lastDoc = null, userId = null) {
    try {
      let q
      if (userId) {
        // Get specific user's feed
        q = query(
          collection(db, 'feed'),
          where('userId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        )
      } else {
        // Get all public feed
        q = query(
          collection(db, 'feed'),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        )
      }
      
      if (lastDoc) {
        q = query(q, startAfter(lastDoc))
      }
      
      const snapshot = await getDocs(q)
      const items = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        _doc: doc // For pagination
      }))
      
      return {
        items,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
        hasMore: snapshot.docs.length === limitCount
      }
    } catch (error) {
      console.error('Error getting feed:', error)
      return { items: [], lastDoc: null, hasMore: false }
    }
  },

  // Get a single feed item
  async getFeedItem(feedId) {
    const docSnap = await getDoc(doc(db, 'feed', feedId))
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() }
    }
    return null
  },

  // Add/remove reaction
  async toggleReaction(feedId, userId, emoji) {
    const feedRef = doc(db, 'feed', feedId)
    const feedDoc = await getDoc(feedRef)
    
    if (!feedDoc.exists()) return
    
    const reactions = feedDoc.data().reactions || {}
    const emojiReactions = reactions[emoji] || []
    const hasReacted = emojiReactions.includes(userId)
    
    if (hasReacted) {
      // Remove reaction
      await updateDoc(feedRef, {
        [`reactions.${emoji}`]: arrayRemove(userId),
        reactionCount: increment(-1)
      })
    } else {
      // Add reaction
      await updateDoc(feedRef, {
        [`reactions.${emoji}`]: arrayUnion(userId),
        reactionCount: increment(1)
      })
    }
    
    return !hasReacted
  },

  // Get comments for a feed item
  async getComments(feedId) {
    const q = query(
      collection(db, 'feed', feedId, 'comments'),
      orderBy('createdAt', 'asc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  },

  // Add a comment
  async addComment(feedId, userId, text) {
    const commentRef = await addDoc(collection(db, 'feed', feedId, 'comments'), {
      userId,
      text,
      createdAt: serverTimestamp()
    })
    
    // Update comment count
    await updateDoc(doc(db, 'feed', feedId), {
      commentCount: increment(1)
    })
    
    return { id: commentRef.id }
  },

  // Delete a comment
  async deleteComment(feedId, commentId, userId) {
    const commentRef = doc(db, 'feed', feedId, 'comments', commentId)
    const commentDoc = await getDoc(commentRef)
    
    if (commentDoc.exists() && commentDoc.data().userId === userId) {
      await deleteDoc(commentRef)
      await updateDoc(doc(db, 'feed', feedId), {
        commentCount: increment(-1)
      })
    }
  },

  // Delete a feed item (owner only)
  async deleteFeedItem(feedId, userId) {
    const feedRef = doc(db, 'feed', feedId)
    const feedDoc = await getDoc(feedRef)
    
    if (feedDoc.exists() && feedDoc.data().userId === userId) {
      await deleteDoc(feedRef)
    }
  }
}

// Feed item types
export const FEED_TYPES = {
  WORKOUT: 'workout',
  CARDIO: 'cardio',
  GOAL_COMPLETED: 'goal_completed',
  GOAL_CREATED: 'goal_created',
  STREAK: 'streak',
  PR: 'personal_record'
}

// Available reactions
export const REACTIONS = ['💪', '🔥', '👏', '🎉', '⚡', '❤️']
