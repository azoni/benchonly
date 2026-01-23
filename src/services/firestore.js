import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { analyticsService, ACTIONS } from './analyticsService';
import { feedService, FEED_TYPES } from './feedService';

// ============ USERS ============
export const userService = {
  async get(userId) {
    const docSnap = await getDoc(doc(db, 'users', userId));
    if (docSnap.exists()) {
      return { uid: docSnap.id, ...docSnap.data() };
    }
    return null;
  },

  async getByUsername(username) {
    if (!username) return null;
    const q = query(
      collection(db, 'users'),
      where('username', '==', username.toLowerCase()),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { uid: doc.id, ...doc.data() };
  },

  async isUsernameAvailable(username, currentUserId = null) {
    if (!username) return false;
    const normalized = username.toLowerCase();
    
    // Check reserved words
    const reserved = ['admin', 'settings', 'feed', 'profile', 'workouts', 'calendar', 'groups', 'goals', 'health', 'tools', 'usage', 'login', 'api'];
    if (reserved.includes(normalized)) return false;
    
    // Check if already taken
    const q = query(
      collection(db, 'users'),
      where('username', '==', normalized),
      limit(1)
    );
    const snapshot = await getDocs(q);
    
    // If no one has it, it's available
    if (snapshot.empty) return true;
    
    // If the current user has it, it's still "available" for them
    if (currentUserId && snapshot.docs[0].id === currentUserId) return true;
    
    return false;
  },

  async setUsername(userId, username) {
    const normalized = username.toLowerCase();
    
    // Validate format
    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
      throw new Error('Username must be 3-20 characters, letters, numbers, and underscores only');
    }
    
    // Check availability
    const available = await this.isUsernameAvailable(normalized, userId);
    if (!available) {
      throw new Error('Username is already taken or reserved');
    }
    
    // Update user document
    await updateDoc(doc(db, 'users', userId), {
      username: normalized,
      updatedAt: serverTimestamp()
    });
    
    return normalized;
  },

  async getAll() {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
  },

  async search(searchTerm) {
    // Firestore doesn't support full-text search, so we fetch all and filter client-side
    // For production, consider Algolia or similar
    const users = await this.getAll();
    const term = searchTerm.toLowerCase();
    return users.filter(u => 
      u.displayName?.toLowerCase().includes(term) ||
      u.email?.toLowerCase().includes(term) ||
      u.username?.toLowerCase().includes(term)
    );
  }
};

// ============ WORKOUTS ============
export const workoutService = {
  // Create a workout for yourself
  async create(userId, workoutData) {
    // Check if workout date is in the future
    const workoutDate = workoutData.date instanceof Date 
      ? workoutData.date 
      : workoutData.date?.toDate 
        ? workoutData.date.toDate() 
        : new Date(workoutData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    workoutDate.setHours(0, 0, 0, 0);
    const isFuture = workoutDate > today;
    
    // Determine if workout is complete
    // Future workouts are always scheduled
    // Cardio workouts (not in future) are complete when logged
    // Strength workouts need actual values filled in
    let isComplete = false;
    if (isFuture) {
      isComplete = false;
    } else if (workoutData.workoutType === 'cardio') {
      isComplete = true;
    } else {
      isComplete = this.checkIfComplete(workoutData.exercises);
    }
    
    const docRef = await addDoc(collection(db, 'workouts'), {
      ...workoutData,
      userId,
      workoutType: workoutData.workoutType || 'strength',
      status: isComplete ? 'completed' : 'scheduled',
      completedAt: isComplete ? serverTimestamp() : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    // Check if any goals should be updated based on this workout
    if (isComplete && workoutData.workoutType !== 'cardio') {
      await this.checkAndUpdateGoals(userId, workoutData);
    }
    
    // Track analytics
    const actionType = workoutData.workoutType === 'cardio' ? ACTIONS.CARDIO_LOGGED : ACTIONS.WORKOUT_CREATED;
    analyticsService.logAction(userId, actionType, {
      workoutType: workoutData.workoutType,
      exerciseCount: workoutData.exercises?.length || 0,
      status: isComplete ? 'completed' : 'scheduled'
    });
    
    // Create feed item for completed workouts
    if (isComplete) {
      try {
        const feedType = workoutData.workoutType === 'cardio' ? FEED_TYPES.CARDIO : FEED_TYPES.WORKOUT;
        await feedService.createFeedItem(userId, feedType, {
          workoutId: docRef.id,
          name: workoutData.name,
          exerciseCount: workoutData.exercises?.length || 0,
          duration: workoutData.duration,
          activityType: workoutData.activityType
        });
      } catch (e) {
        console.error('Feed error:', e);
      }
    }
    
    return { id: docRef.id, ...workoutData, status: isComplete ? 'completed' : 'scheduled' };
  },
  
  // Check if a workout has actual values filled in (meaning it's complete)
  checkIfComplete(exercises) {
    if (!exercises || exercises.length === 0) return false;
    
    // A workout is complete if at least one exercise has actual values
    return exercises.some(exercise => 
      exercise.sets?.some(set => 
        set.actualWeight || set.actualReps
      )
    );
  },
  
  // Complete a scheduled workout by adding actual values
  async completeWorkout(workoutId, exercisesWithActuals, userId) {
    const docRef = doc(db, 'workouts', workoutId);
    
    // Get workout name for feed
    const workoutDoc = await getDoc(docRef);
    const workoutName = workoutDoc.data()?.name || 'Workout';
    
    await updateDoc(docRef, {
      exercises: exercisesWithActuals,
      status: 'completed',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    // Check goals
    const workoutData = { exercises: exercisesWithActuals };
    await this.checkAndUpdateGoals(userId, workoutData);
    
    // Track analytics
    analyticsService.logAction(userId, ACTIONS.WORKOUT_COMPLETED, {
      exerciseCount: exercisesWithActuals?.length || 0
    });
    
    // Create feed item
    try {
      await feedService.createFeedItem(userId, FEED_TYPES.WORKOUT, {
        workoutId,
        name: workoutName,
        exerciseCount: exercisesWithActuals?.length || 0
      });
    } catch (e) {
      console.error('Feed error:', e);
    }
    
    return { id: workoutId, status: 'completed' };
  },
  
  // Get cardio activities by user
  async getCardioByUser(userId, limitCount = 30) {
    const q = query(
      collection(db, 'workouts'),
      where('userId', '==', userId),
      where('workoutType', '==', 'cardio'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return results.sort((a, b) => {
      const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
      const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
      return dateB - dateA;
    });
  },
  
  // Get workouts for a specific date
  async getByDate(userId, date) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    const q = query(
      collection(db, 'workouts'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter(w => {
        const wDate = w.date?.toDate ? w.date.toDate().toISOString().split('T')[0] : w.date;
        return wDate === dateStr;
      });
  },
  
  // Create a workout assigned to another user (for group admins)
  async createForUser(assignedUserId, workoutData, createdByUserId, groupId) {
    const docRef = await addDoc(collection(db, 'workouts'), {
      ...workoutData,
      userId: assignedUserId,
      createdBy: createdByUserId,
      groupId: groupId,
      workoutType: workoutData.workoutType || 'strength',
      status: 'scheduled',  // Always starts as scheduled when assigned
      isAssigned: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    return { id: docRef.id, ...workoutData, userId: assignedUserId, status: 'scheduled' };
  },
  
  // Create the same workout for multiple users in a group
  async createForGroup(groupId, workoutData, createdByUserId, memberIds) {
    const batch = writeBatch(db);
    const workoutIds = [];
    
    for (const memberId of memberIds) {
      const docRef = doc(collection(db, 'workouts'));
      batch.set(docRef, {
        ...workoutData,
        userId: memberId,
        createdBy: createdByUserId,
        groupId: groupId,
        workoutType: workoutData.workoutType || 'strength',
        status: 'scheduled',  // Always starts as scheduled
        isAssigned: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      workoutIds.push({ id: docRef.id, memberId });
    }
    
    await batch.commit();
    return workoutIds;
  },
  
  async checkAndUpdateGoals(userId, workoutData) {
    try {
      // Get user's active goals
      const goalsQuery = query(
        collection(db, 'goals'),
        where('userId', '==', userId),
        where('status', '==', 'active')
      );
      const goalsSnapshot = await getDocs(goalsQuery);
      
      if (goalsSnapshot.empty) return;
      
      // Process each exercise in the workout
      for (const exercise of workoutData.exercises || []) {
        const exerciseName = exercise.name?.toLowerCase().trim();
        
        for (const goalDoc of goalsSnapshot.docs) {
          const goal = goalDoc.data();
          const goalLift = goal.lift?.toLowerCase().trim();
          const metricType = goal.metricType || 'weight';
          
          // Check if exercise matches goal lift
          if (exerciseName && goalLift && (exerciseName.includes(goalLift) || goalLift?.includes(exerciseName))) {
            let bestValue = 0;
            
            // Find the best value from a SINGLE set based on metric type
            for (const set of exercise.sets || []) {
              let setValue = 0;
              
              if (metricType === 'weight') {
                setValue = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0;
              } else if (metricType === 'reps') {
                // For reps goals, find the MAX reps in a single set (not total)
                setValue = parseInt(set.actualReps) || parseInt(set.prescribedReps) || 0;
              } else if (metricType === 'time') {
                // For time goals, find the max time in a single set
                setValue = parseFloat(set.actualTime) || parseFloat(set.prescribedTime) || 0;
              }
              
              if (setValue > bestValue) {
                bestValue = setValue;
              }
            }
            
            if (bestValue > 0) {
              const targetValue = parseFloat(goal.targetValue) || parseFloat(goal.targetWeight) || 0;
              const startValue = parseFloat(goal.startValue) || parseFloat(goal.startWeight) || parseFloat(goal.currentValue) || parseFloat(goal.currentWeight) || 0;
              const currentValue = parseFloat(goal.currentValue) || parseFloat(goal.currentWeight) || startValue;
              
              // Calculate progress percentage
              let progress = 0;
              if (targetValue > startValue) {
                progress = Math.min(100, Math.round(((bestValue - startValue) / (targetValue - startValue)) * 100));
              }
              
              // Update goal with new progress and current value
              const updates = {
                currentValue: bestValue,
                currentWeight: metricType === 'weight' ? bestValue : goal.currentWeight, // Keep for backward compat
                progress: Math.max(goal.progress || 0, progress), // Only increase, never decrease
                updatedAt: serverTimestamp(),
              };
              
              // Mark as completed if target reached
              if (bestValue >= targetValue) {
                updates.status = 'completed';
                updates.completedAt = serverTimestamp();
                
                // Create feed item for goal completion
                try {
                  await feedService.createFeedItem(userId, FEED_TYPES.GOAL_COMPLETED, {
                    goalId: goalDoc.id,
                    lift: goal.lift,
                    targetValue: targetValue,
                    metricType,
                    unit: metricType === 'weight' ? 'lbs' : metricType === 'reps' ? 'reps' : 'sec'
                  });
                } catch (e) {
                  console.error('Feed error:', e);
                }
              }
              
              // Only update if this is a new PR or first entry
              if (bestValue >= currentValue) {
                await updateDoc(doc(db, 'goals', goalDoc.id), updates);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking goals:', error);
      // Don't throw - we don't want goal checking to break workout saving
    }
  },

  async get(workoutId) {
    const docSnap = await getDoc(doc(db, 'workouts', workoutId));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  },
  
  // Alias for get
  async getById(workoutId) {
    return this.get(workoutId);
  },

  async getByUser(userId, limitCount = 50) {
    const q = query(
      collection(db, 'workouts'),
      where('userId', '==', userId),
      orderBy('date', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getByGroup(groupId, limitCount = 50) {
    const q = query(
      collection(db, 'workouts'),
      where('groupId', '==', groupId),
      orderBy('date', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getByDateRange(userId, startDate, endDate) {
    const q = query(
      collection(db, 'workouts'),
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async update(workoutId, updates) {
    const docRef = doc(db, 'workouts', workoutId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return { id: workoutId, ...updates };
  },

  async delete(workoutId) {
    await deleteDoc(doc(db, 'workouts', workoutId));
    return workoutId;
  },

  async logExercise(workoutId, exerciseData) {
    const docRef = doc(db, 'workouts', workoutId);
    await updateDoc(docRef, {
      exercises: arrayUnion(exerciseData),
      updatedAt: serverTimestamp(),
    });
  },
};

// ============ GROUPS ============
export const groupService = {
  // Generate a random invite code
  generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },

  async create(creatorId, groupData) {
    const inviteCode = this.generateInviteCode();
    const docRef = await addDoc(collection(db, 'groups'), {
      ...groupData,
      creatorId,
      inviteCode,
      members: [creatorId],
      admins: [creatorId],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    // Add group to creator's profile
    const userRef = doc(db, 'users', creatorId);
    await updateDoc(userRef, {
      groups: arrayUnion(docRef.id),
    });
    
    return { id: docRef.id, inviteCode, ...groupData };
  },

  async get(groupId) {
    const docSnap = await getDoc(doc(db, 'groups', groupId));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  },
  
  // Alias for get
  async getById(groupId) {
    return this.get(groupId);
  },
  
  // Get detailed info for multiple members
  async getMemberDetails(memberIds) {
    const members = [];
    for (const memberId of memberIds) {
      const userSnap = await getDoc(doc(db, 'users', memberId));
      if (userSnap.exists()) {
        members.push({ uid: memberId, ...userSnap.data() });
      } else {
        // User doc might not exist yet, return basic info
        members.push({ uid: memberId, displayName: 'Unknown User' });
      }
    }
    return members;
  },

  async getByUser(userId) {
    const q = query(
      collection(db, 'groups'),
      where('members', 'array-contains', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async findByInviteCode(code) {
    const q = query(
      collection(db, 'groups'),
      where('inviteCode', '==', code.toUpperCase())
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },

  async joinByCode(code, userId) {
    const group = await this.findByInviteCode(code);
    if (!group) {
      throw new Error('Invalid invite code');
    }
    if (group.members?.includes(userId)) {
      throw new Error('Already a member of this group');
    }
    await this.addMember(group.id, userId);
    return group;
  },

  async update(groupId, updates) {
    const docRef = doc(db, 'groups', groupId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return { id: groupId, ...updates };
  },

  async addMember(groupId, userId) {
    const batch = writeBatch(db);
    
    const groupRef = doc(db, 'groups', groupId);
    batch.update(groupRef, {
      members: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });
    
    const userRef = doc(db, 'users', userId);
    batch.update(userRef, {
      groups: arrayUnion(groupId),
    });
    
    await batch.commit();
  },

  async removeMember(groupId, userId) {
    const batch = writeBatch(db);
    
    const groupRef = doc(db, 'groups', groupId);
    batch.update(groupRef, {
      members: arrayRemove(userId),
      admins: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });
    
    const userRef = doc(db, 'users', userId);
    batch.update(userRef, {
      groups: arrayRemove(groupId),
    });
    
    await batch.commit();
  },

  async getMembers(groupId) {
    const group = await this.get(groupId);
    if (!group) return [];
    
    const members = await Promise.all(
      group.members.map(async (uid) => {
        const userSnap = await getDoc(doc(db, 'users', uid));
        return userSnap.exists() ? { id: uid, ...userSnap.data() } : null;
      })
    );
    
    return members.filter(Boolean);
  },

  async delete(groupId) {
    const group = await this.get(groupId);
    if (!group) return;
    
    const batch = writeBatch(db);
    
    // Remove group from all members
    for (const uid of group.members) {
      const userRef = doc(db, 'users', uid);
      batch.update(userRef, {
        groups: arrayRemove(groupId),
      });
    }
    
    batch.delete(doc(db, 'groups', groupId));
    await batch.commit();
  },
};

// ============ GOALS ============
export const goalService = {
  async create(userId, goalData) {
    const docRef = await addDoc(collection(db, 'goals'), {
      ...goalData,
      userId,
      status: 'active',
      progress: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, ...goalData };
  },

  async get(goalId) {
    const docSnap = await getDoc(doc(db, 'goals', goalId));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  },

  async getByUser(userId) {
    const q = query(
      collection(db, 'goals'),
      where('userId', '==', userId),
      orderBy('targetDate', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async update(goalId, updates) {
    const docRef = doc(db, 'goals', goalId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return { id: goalId, ...updates };
  },

  async delete(goalId) {
    await deleteDoc(doc(db, 'goals', goalId));
    return goalId;
  },
};

// ============ SCHEDULE ============
export const scheduleService = {
  async create(userId, scheduleData) {
    const docRef = await addDoc(collection(db, 'schedules'), {
      ...scheduleData,
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, ...scheduleData };
  },

  async getByUser(userId) {
    const q = query(
      collection(db, 'schedules'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getByGroup(groupId) {
    const q = query(
      collection(db, 'schedules'),
      where('groupId', '==', groupId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async update(scheduleId, updates) {
    const docRef = doc(db, 'schedules', scheduleId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return { id: scheduleId, ...updates };
  },

  async delete(scheduleId) {
    await deleteDoc(doc(db, 'schedules', scheduleId));
    return scheduleId;
  },
};

// ============ ATTENDANCE ============
export const attendanceService = {
  async log(userId, date, status, workoutId = null) {
    const dateStr = date.toISOString().split('T')[0];
    const docRef = doc(db, 'attendance', `${userId}_${dateStr}`);
    
    await updateDoc(docRef, {
      userId,
      date: dateStr,
      status, // 'present' | 'missed' | 'vacation'
      workoutId,
      updatedAt: serverTimestamp(),
    }).catch(async () => {
      // Doc doesn't exist, create it
      await addDoc(collection(db, 'attendance'), {
        userId,
        date: dateStr,
        status,
        workoutId,
        createdAt: serverTimestamp(),
      });
    });
  },

  async getByUser(userId, startDate, endDate) {
    const q = query(
      collection(db, 'attendance'),
      where('userId', '==', userId),
      where('date', '>=', startDate.toISOString().split('T')[0]),
      where('date', '<=', endDate.toISOString().split('T')[0])
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },
  
  // Alias for getByUser
  async getByDateRange(userId, startDate, endDate) {
    return this.getByUser(userId, startDate, endDate);
  },

  async getByGroup(groupId, startDate, endDate) {
    const group = await groupService.get(groupId);
    if (!group) return [];
    
    const allAttendance = await Promise.all(
      group.members.map((uid) => this.getByUser(uid, startDate, endDate))
    );
    
    return allAttendance.flat();
  },
};

// ============ TOKEN USAGE ============
export const tokenUsageService = {
  async log(usageData) {
    const docRef = await addDoc(collection(db, 'tokenUsage'), {
      ...usageData,
      createdAt: serverTimestamp(),
    });
    return { id: docRef.id, ...usageData };
  },

  async getRecent(limitCount = 100) {
    const q = query(
      collection(db, 'tokenUsage'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getByUser(userId, limitCount = 50) {
    const q = query(
      collection(db, 'tokenUsage'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async getSummary() {
    const records = await this.getRecent(500);
    
    const summary = {
      totalTokens: records.reduce((acc, r) => acc + (r.totalTokens || 0), 0),
      totalRequests: records.length,
      byFeature: {}
    };

    records.forEach(r => {
      if (r.feature) {
        if (!summary.byFeature[r.feature]) {
          summary.byFeature[r.feature] = { tokens: 0, requests: 0 };
        }
        summary.byFeature[r.feature].tokens += r.totalTokens || 0;
        summary.byFeature[r.feature].requests += 1;
      }
    });

    // Get unique user IDs and fetch their details
    const userIds = [...new Set(records.map(r => r.userId))].filter(Boolean);
    const users = [];
    
    for (const uid of userIds) {
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) {
          const userData = userSnap.data();
          users.push({ 
            id: uid, 
            displayName: userData.displayName || userData.email || uid,
            email: userData.email 
          });
        } else {
          users.push({ id: uid, displayName: uid });
        }
      } catch {
        users.push({ id: uid, displayName: uid });
      }
    }

    // Add user names to records for display
    const userMap = Object.fromEntries(users.map(u => [u.id, u.displayName]));
    const enrichedRecords = records.map(r => ({
      ...r,
      userName: userMap[r.userId] || r.userId
    }));

    // Group consecutive same-feature requests from same user within 5 min
    const groupedRecords = [];
    let currentGroup = null;

    enrichedRecords.forEach(record => {
      const recordTime = record.createdAt?.toDate ? record.createdAt.toDate() : new Date(record.createdAt);
      
      if (currentGroup && 
          currentGroup.feature === record.feature && 
          currentGroup.userId === record.userId) {
        const groupTime = currentGroup.createdAt?.toDate ? currentGroup.createdAt.toDate() : new Date(currentGroup.createdAt);
        const timeDiff = Math.abs(groupTime - recordTime) / 1000 / 60; // minutes
        
        if (timeDiff <= 5) {
          // Add to current group
          currentGroup.totalTokens += record.totalTokens || 0;
          currentGroup.promptTokens += record.promptTokens || 0;
          currentGroup.completionTokens += record.completionTokens || 0;
          currentGroup.requestCount = (currentGroup.requestCount || 1) + 1;
          return;
        }
      }
      
      // Start new group
      if (currentGroup) groupedRecords.push(currentGroup);
      currentGroup = { ...record, requestCount: 1 };
    });
    
    if (currentGroup) groupedRecords.push(currentGroup);

    return { records: groupedRecords, summary, users };
  }
};

// ============ HEALTH TRACKING ============
export const healthService = {
  async create(userId, entryData) {
    const docRef = await addDoc(collection(db, 'health'), {
      ...entryData,
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, ...entryData, userId };
  },

  async update(entryId, updates) {
    const docRef = doc(db, 'health', entryId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return { id: entryId, ...updates };
  },

  async getByUser(userId, limitCount = 30) {
    // Simple query without orderBy to avoid index requirement
    // Sort on client side instead
    const q = query(
      collection(db, 'health'),
      where('userId', '==', userId),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    // Sort by date descending on client
    return results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  async getByDateRange(userId, startDate, endDate) {
    // Simple query, filter on client to avoid composite index
    const q = query(
      collection(db, 'health'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    const results = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter(entry => entry.date >= startDate && entry.date <= endDate);
    return results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  async delete(entryId) {
    await deleteDoc(doc(db, 'health', entryId));
  }
};

// ============ GROUP WORKOUTS ============
export const groupWorkoutService = {
  // Create a workout assigned to a specific group member
  async create(groupId, groupAdmins, assignedTo, workoutData) {
    const docRef = await addDoc(collection(db, 'groupWorkouts'), {
      ...workoutData,
      groupId,
      groupAdmins,
      assignedTo,
      status: 'scheduled', // scheduled, completed
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, ...workoutData, groupId, assignedTo, status: 'scheduled' };
  },

  // Get all group workouts for a specific group
  async getByGroup(groupId) {
    const q = query(
      collection(db, 'groupWorkouts'),
      where('groupId', '==', groupId),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  // Get group workouts assigned to a specific user
  async getByUser(userId) {
    const q = query(
      collection(db, 'groupWorkouts'),
      where('assignedTo', '==', userId),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  // Get group workouts for a user within a date range
  async getByUserAndDateRange(userId, startDate, endDate) {
    const q = query(
      collection(db, 'groupWorkouts'),
      where('assignedTo', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  // Get a single group workout
  async get(workoutId) {
    const docSnap = await getDoc(doc(db, 'groupWorkouts', workoutId));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  },

  // Update a group workout (member logging their actuals, or admin editing)
  async update(workoutId, updates) {
    const docRef = doc(db, 'groupWorkouts', workoutId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return { id: workoutId, ...updates };
  },

  // Mark workout as completed with actual values
  async complete(workoutId, actualData) {
    const docRef = doc(db, 'groupWorkouts', workoutId);
    await updateDoc(docRef, {
      ...actualData,
      status: 'completed',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: workoutId, status: 'completed', ...actualData };
  },

  // Delete a group workout
  async delete(workoutId) {
    await deleteDoc(doc(db, 'groupWorkouts', workoutId));
    return workoutId;
  },

  // Batch create workouts for multiple members (same date, different prescriptions)
  async createBatch(groupId, groupAdmins, date, memberWorkouts) {
    const batch = writeBatch(db);
    const results = [];

    for (const { assignedTo, name, exercises } of memberWorkouts) {
      const docRef = doc(collection(db, 'groupWorkouts'));
      const workoutData = {
        groupId,
        groupAdmins,
        assignedTo,
        userId: assignedTo, // Add userId for consistency
        name,
        date,
        exercises,
        status: 'scheduled',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      batch.set(docRef, workoutData);
      results.push({ id: docRef.id, ...workoutData });
    }

    await batch.commit();
    return results;
  }
};

// ============ RECURRING ACTIVITIES ============
export const recurringActivityService = {
  async create(userId, activityData) {
    const docRef = await addDoc(collection(db, 'recurringActivities'), {
      ...activityData,
      userId,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, ...activityData, userId, active: true };
  },

  async getByUser(userId) {
    const q = query(
      collection(db, 'recurringActivities'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async update(activityId, updates) {
    const docRef = doc(db, 'recurringActivities', activityId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return { id: activityId, ...updates };
  },

  async delete(activityId) {
    await deleteDoc(doc(db, 'recurringActivities', activityId));
    return activityId;
  },

  // Log a skip for a specific date
  async logSkip(activityId, date, userId) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    const skipRef = doc(db, 'activitySkips', `${activityId}_${dateStr}`);
    await setDoc(skipRef, {
      activityId,
      userId,
      date: dateStr,
      createdAt: serverTimestamp(),
    });
    return { activityId, date: dateStr, skipped: true };
  },

  // Check if activity was skipped on a date
  async getSkips(userId, startDate, endDate) {
    const q = query(
      collection(db, 'activitySkips'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter(skip => skip.date >= startDate && skip.date <= endDate);
  },

  // Remove a skip (user completed it after all)
  async removeSkip(activityId, date) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    const skipRef = doc(db, 'activitySkips', `${activityId}_${dateStr}`);
    await deleteDoc(skipRef);
    return { activityId, date: dateStr, skipped: false };
  }
};