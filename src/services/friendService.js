import { db } from './firebase'
import { 
  collection, 
  addDoc, 
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  or,
  writeBatch,
} from 'firebase/firestore'
import { notificationService } from './feedService'

// ============ FRIEND SERVICE ============

export const FRIEND_STATUS = {
  NONE: 'none',
  PENDING_SENT: 'pending_sent',     // current user sent request
  PENDING_RECEIVED: 'pending_received', // current user received request
  FRIENDS: 'friends',
}

export const friendService = {
  /**
   * Send a friend request
   */
  async sendRequest(fromUserId, toUserId) {
    if (fromUserId === toUserId) throw new Error('Cannot friend yourself')
    
    // Check if already friends
    const status = await this.getFriendshipStatus(fromUserId, toUserId)
    if (status.status === FRIEND_STATUS.FRIENDS) throw new Error('Already friends')
    if (status.status === FRIEND_STATUS.PENDING_SENT) throw new Error('Request already sent')
    
    // If they already sent us a request, just accept it
    if (status.status === FRIEND_STATUS.PENDING_RECEIVED) {
      return this.acceptRequest(status.requestId)
    }

    const docRef = await addDoc(collection(db, 'friendRequests'), {
      from: fromUserId,
      to: toUserId,
      status: 'pending',
      createdAt: serverTimestamp(),
    })

    // Notify the recipient
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: toUserId,
        type: 'friend_request',
        fromUserId,
        read: false,
        createdAt: serverTimestamp(),
      })
    } catch (e) {
      console.error('Notification error:', e)
    }

    return { id: docRef.id }
  },

  /**
   * Accept a friend request — creates friendship, deletes request
   */
  async acceptRequest(requestId) {
    const requestRef = doc(db, 'friendRequests', requestId)
    const requestDoc = await getDoc(requestRef)
    if (!requestDoc.exists()) throw new Error('Request not found')

    const { from, to } = requestDoc.data()
    const users = [from, to].sort() // consistent ordering

    const batch = writeBatch(db)

    // Create friendship
    const friendshipRef = doc(collection(db, 'friendships'))
    batch.set(friendshipRef, {
      users,
      user1: users[0],
      user2: users[1],
      createdAt: serverTimestamp(),
    })

    // Delete the request
    batch.delete(requestRef)

    await batch.commit()

    // Notify the sender that their request was accepted
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: from,
        type: 'friend_accepted',
        fromUserId: to,
        read: false,
        createdAt: serverTimestamp(),
      })
    } catch (e) {
      console.error('Notification error:', e)
    }

    return { id: friendshipRef.id }
  },

  /**
   * Decline a friend request
   */
  async declineRequest(requestId) {
    await deleteDoc(doc(db, 'friendRequests', requestId))
  },

  /**
   * Cancel a sent friend request
   */
  async cancelRequest(requestId) {
    await deleteDoc(doc(db, 'friendRequests', requestId))
  },

  /**
   * Remove a friend (delete the friendship doc)
   */
  async removeFriend(currentUserId, friendUserId) {
    const friendship = await this._findFriendship(currentUserId, friendUserId)
    if (friendship) {
      await deleteDoc(doc(db, 'friendships', friendship.id))
    }
  },

  /**
   * Get all friends for a user — returns array of friend userIds
   */
  async getFriends(userId) {
    // Query where user is user1 or user2
    const q1 = query(
      collection(db, 'friendships'),
      where('user1', '==', userId)
    )
    const q2 = query(
      collection(db, 'friendships'),
      where('user2', '==', userId)
    )

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)])
    
    const friendIds = new Set()
    snap1.docs.forEach(d => {
      const data = d.data()
      const other = data.users.find(u => u !== userId)
      if (other) friendIds.add(other)
    })
    snap2.docs.forEach(d => {
      const data = d.data()
      const other = data.users.find(u => u !== userId)
      if (other) friendIds.add(other)
    })

    return [...friendIds]
  },

  /**
   * Get all friends as a Set (for efficient lookups in feed filtering)
   */
  async getFriendSet(userId) {
    const friends = await this.getFriends(userId)
    return new Set(friends)
  },

  /**
   * Get pending friend requests received by this user
   */
  async getReceivedRequests(userId) {
    const q = query(
      collection(db, 'friendRequests'),
      where('to', '==', userId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  },

  /**
   * Get pending friend requests sent by this user
   */
  async getSentRequests(userId) {
    const q = query(
      collection(db, 'friendRequests'),
      where('from', '==', userId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  },

  /**
   * Check friendship status between two users
   * Returns { status, requestId? }
   */
  async getFriendshipStatus(currentUserId, otherUserId) {
    // Check if friends
    const friendship = await this._findFriendship(currentUserId, otherUserId)
    if (friendship) return { status: FRIEND_STATUS.FRIENDS, friendshipId: friendship.id }

    // Check for pending requests
    const sentQ = query(
      collection(db, 'friendRequests'),
      where('from', '==', currentUserId),
      where('to', '==', otherUserId),
      where('status', '==', 'pending')
    )
    const sentSnap = await getDocs(sentQ)
    if (!sentSnap.empty) {
      return { status: FRIEND_STATUS.PENDING_SENT, requestId: sentSnap.docs[0].id }
    }

    const receivedQ = query(
      collection(db, 'friendRequests'),
      where('from', '==', otherUserId),
      where('to', '==', currentUserId),
      where('status', '==', 'pending')
    )
    const receivedSnap = await getDocs(receivedQ)
    if (!receivedSnap.empty) {
      return { status: FRIEND_STATUS.PENDING_RECEIVED, requestId: receivedSnap.docs[0].id }
    }

    return { status: FRIEND_STATUS.NONE }
  },

  /**
   * Get friend count for a user
   */
  async getFriendCount(userId) {
    const friends = await this.getFriends(userId)
    return friends.length
  },

  // Internal: find the friendship doc between two users
  async _findFriendship(uid1, uid2) {
    const sorted = [uid1, uid2].sort()
    const q = query(
      collection(db, 'friendships'),
      where('user1', '==', sorted[0]),
      where('user2', '==', sorted[1])
    )
    const snap = await getDocs(q)
    if (snap.empty) return null
    return { id: snap.docs[0].id, ...snap.docs[0].data() }
  },
}
