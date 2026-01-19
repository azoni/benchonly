import { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../services/firebase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

// Sample data for guest mode
const GUEST_USER = {
  uid: 'guest-user',
  email: 'guest@benchonly.com',
  displayName: 'Guest User',
  photoURL: null,
};

const GUEST_PROFILE = {
  uid: 'guest-user',
  email: 'guest@benchonly.com',
  displayName: 'Guest User',
  photoURL: null,
  role: 'member',
  groups: ['sample-group'],
  settings: {
    notifications: true,
    units: 'lbs',
    theme: 'dark',
  },
};

// Function to generate fresh sample data with current dates
export const getSampleWorkouts = () => [
  {
    id: 'sample-1',
    userId: 'guest-user',
    name: 'Heavy Bench Day',
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    status: 'completed',
    exercises: [
      {
        id: 1,
        name: 'Bench Press',
        sets: [
          { prescribedWeight: '275', prescribedReps: '5', actualWeight: '275', actualReps: '5', rpe: '7' },
          { prescribedWeight: '285', prescribedReps: '5', actualWeight: '285', actualReps: '5', rpe: '8' },
          { prescribedWeight: '295', prescribedReps: '3', actualWeight: '295', actualReps: '4', rpe: '9' },
        ]
      },
      {
        id: 2,
        name: 'Close Grip Bench',
        sets: [
          { prescribedWeight: '185', prescribedReps: '8', actualWeight: '185', actualReps: '8', rpe: '7' },
          { prescribedWeight: '185', prescribedReps: '8', actualWeight: '185', actualReps: '8', rpe: '8' },
        ]
      }
    ]
  },
  {
    id: 'sample-2',
    userId: 'guest-user',
    name: 'Volume Day',
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    status: 'completed',
    exercises: [
      {
        id: 1,
        name: 'Bench Press',
        sets: [
          { prescribedWeight: '225', prescribedReps: '8', actualWeight: '225', actualReps: '8', rpe: '6' },
          { prescribedWeight: '225', prescribedReps: '8', actualWeight: '225', actualReps: '8', rpe: '7' },
          { prescribedWeight: '225', prescribedReps: '8', actualWeight: '225', actualReps: '8', rpe: '7' },
          { prescribedWeight: '225', prescribedReps: '8', actualWeight: '225', actualReps: '7', rpe: '8' },
        ]
      }
    ]
  },
  {
    id: 'sample-3',
    userId: 'guest-user',
    name: 'Accessory Work',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    status: 'completed',
    exercises: [
      {
        id: 1,
        name: 'Incline Dumbbell Press',
        sets: [
          { prescribedWeight: '70', prescribedReps: '10', actualWeight: '70', actualReps: '10', rpe: '7' },
          { prescribedWeight: '70', prescribedReps: '10', actualWeight: '70', actualReps: '9', rpe: '8' },
        ]
      },
      {
        id: 2,
        name: 'Tricep Pushdown',
        sets: [
          { prescribedWeight: '50', prescribedReps: '12', actualWeight: '50', actualReps: '12', rpe: '6' },
          { prescribedWeight: '50', prescribedReps: '12', actualWeight: '50', actualReps: '12', rpe: '7' },
        ]
      }
    ]
  },
  {
    id: 'sample-scheduled',
    userId: 'guest-user',
    name: 'Tomorrow\'s Workout',
    date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    status: 'scheduled',
    exercises: [
      {
        id: 1,
        name: 'Bench Press',
        sets: [
          { prescribedWeight: '280', prescribedReps: '5', actualWeight: '', actualReps: '', rpe: '' },
          { prescribedWeight: '290', prescribedReps: '5', actualWeight: '', actualReps: '', rpe: '' },
          { prescribedWeight: '300', prescribedReps: '3', actualWeight: '', actualReps: '', rpe: '' },
        ]
      }
    ]
  }
];

// Keep static exports for backwards compatibility but they'll use the function
export const SAMPLE_WORKOUTS = getSampleWorkouts();

export const SAMPLE_GOALS = [
  {
    id: 'goal-1',
    userId: 'guest-user',
    lift: 'Bench Press',
    startWeight: 275,
    currentWeight: 295,
    targetWeight: 315,
    targetDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'active',
  },
  {
    id: 'goal-2',
    userId: 'guest-user',
    lift: 'Close Grip Bench',
    startWeight: 185,
    currentWeight: 205,
    targetWeight: 225,
    targetDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'active',
  }
];

export const SAMPLE_GROUPS = [
  {
    id: 'sample-group',
    name: 'Bench Bros',
    description: 'A group for serious bench pressers',
    admins: ['guest-user'],
    members: ['guest-user', 'member-1', 'member-2'],
    createdAt: new Date(),
    inviteCode: 'BENCHBROS',
  }
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setIsGuest(false);
        
        // Fetch or create user profile
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          setUserProfile(userSnap.data());
        } else {
          // Create new user profile
          const newProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            createdAt: serverTimestamp(),
            lastActive: serverTimestamp(),
            role: 'member',
            groups: [],
            settings: {
              notifications: true,
              units: 'lbs',
              theme: 'dark',
            },
          };
          
          await setDoc(userRef, newProfile);
          setUserProfile(newProfile);
        }
      } else if (!isGuest) {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isGuest]);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setIsGuest(false);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Google sign in error:', error);
      return { success: false, error: error.message };
    }
  };

  const signInAsGuest = () => {
    setUser(GUEST_USER);
    setUserProfile(GUEST_PROFILE);
    setIsGuest(true);
    setLoading(false);
    return { success: true };
  };

  const signOut = async () => {
    try {
      if (isGuest) {
        setUser(null);
        setUserProfile(null);
        setIsGuest(false);
        return { success: true };
      }
      await firebaseSignOut(auth);
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error: error.message };
    }
  };

  const updateProfile = async (updates) => {
    if (!user) return { success: false, error: 'Not authenticated' };
    
    // Guest mode - just update local state
    if (isGuest) {
      setUserProfile((prev) => ({ ...prev, ...updates }));
      return { success: true };
    }
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        ...updates,
        lastActive: serverTimestamp(),
      }, { merge: true });
      
      setUserProfile((prev) => ({ ...prev, ...updates }));
      return { success: true };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: error.message };
    }
  };

  const value = {
    user,
    userProfile,
    loading,
    isGuest,
    signInWithGoogle,
    signInAsGuest,
    signOut,
    updateProfile,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}