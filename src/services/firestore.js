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
  async create(userId, workoutData) {
    const docRef = await addDoc(collection(db, 'workouts'), {
      ...workoutData,
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, ...workoutData };
  },

  async get(workoutId) {
    const docSnap = await getDoc(doc(db, 'workouts', workoutId));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
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

  async getByGroup(groupId, startDate, endDate) {
    const group = await groupService.get(groupId);
    if (!group) return [];
    
    const allAttendance = await Promise.all(
      group.members.map((uid) => this.getByUser(uid, startDate, endDate))
    );
    
    return allAttendance.flat();
  },
};
