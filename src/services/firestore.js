import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
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

// ============ WORKOUTS ============
export const workoutService = {
  // Create a workout for yourself
  async create(userId, workoutData) {
    // Determine if workout is complete (has actual values filled in)
    const isComplete = this.checkIfComplete(workoutData.exercises);
    
    const docRef = await addDoc(collection(db, 'workouts'), {
      ...workoutData,
      userId,
      status: isComplete ? 'completed' : 'scheduled',
      completedAt: isComplete ? serverTimestamp() : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    // Check if any goals should be updated based on this workout
    if (isComplete) {
      await this.checkAndUpdateGoals(userId, workoutData);
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
    
    await updateDoc(docRef, {
      exercises: exercisesWithActuals,
      status: 'completed',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    // Check goals
    const workoutData = { exercises: exercisesWithActuals };
    await this.checkAndUpdateGoals(userId, workoutData);
    
    return { id: workoutId, status: 'completed' };
  },
  
  // Create a workout assigned to another user (for group admins)
  async createForUser(assignedUserId, workoutData, createdByUserId, groupId) {
    const docRef = await addDoc(collection(db, 'workouts'), {
      ...workoutData,
      userId: assignedUserId,
      createdBy: createdByUserId,
      groupId: groupId,
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
          
          // Check if exercise matches goal lift
          if (exerciseName && goalLift && exerciseName.includes(goalLift) || goalLift?.includes(exerciseName)) {
            // Find the heaviest successful set
            let maxWeight = 0;
            for (const set of exercise.sets || []) {
              const weight = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0;
              if (weight > maxWeight) {
                maxWeight = weight;
              }
            }
            
            if (maxWeight > 0) {
              const targetWeight = parseFloat(goal.targetWeight) || 0;
              const startWeight = parseFloat(goal.startWeight) || 0;
              
              // Calculate progress percentage
              let progress = 0;
              if (targetWeight > startWeight) {
                progress = Math.min(100, Math.round(((maxWeight - startWeight) / (targetWeight - startWeight)) * 100));
              }
              
              // Update goal with new progress and current weight
              const updates = {
                currentWeight: maxWeight,
                progress: Math.max(goal.progress || 0, progress), // Only increase, never decrease
                updatedAt: serverTimestamp(),
              };
              
              // Mark as completed if target reached
              if (maxWeight >= targetWeight) {
                updates.status = 'completed';
                updates.completedAt = serverTimestamp();
              }
              
              // Only update if this is a new PR or first entry
              if (maxWeight >= (goal.currentWeight || 0)) {
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
  async create(creatorId, groupData) {
    const docRef = await addDoc(collection(db, 'groups'), {
      ...groupData,
      creatorId,
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
    
    return { id: docRef.id, ...groupData };
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