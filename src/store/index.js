import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Auth Store
export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      loading: true,
      setUser: (user) => set({ user, loading: false }),
      setLoading: (loading) => set({ loading }),
      logout: () => set({ user: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);

// Workout Store
export const useWorkoutStore = create((set, get) => ({
  workouts: [],
  currentWorkout: null,
  loading: false,
  
  setWorkouts: (workouts) => set({ workouts }),
  setCurrentWorkout: (workout) => set({ currentWorkout: workout }),
  setLoading: (loading) => set({ loading }),
  
  addWorkout: (workout) => set((state) => ({
    workouts: [...state.workouts, workout]
  })),
  
  updateWorkout: (id, updates) => set((state) => ({
    workouts: state.workouts.map((w) =>
      w.id === id ? { ...w, ...updates } : w
    )
  })),
  
  deleteWorkout: (id) => set((state) => ({
    workouts: state.workouts.filter((w) => w.id !== id)
  })),
}));

// Group Store
export const useGroupStore = create((set) => ({
  groups: [],
  currentGroup: null,
  members: [],
  loading: false,
  
  setGroups: (groups) => set({ groups }),
  setCurrentGroup: (group) => set({ currentGroup: group }),
  setMembers: (members) => set({ members }),
  setLoading: (loading) => set({ loading }),
  
  addGroup: (group) => set((state) => ({
    groups: [...state.groups, group]
  })),
  
  updateGroup: (id, updates) => set((state) => ({
    groups: state.groups.map((g) =>
      g.id === id ? { ...g, ...updates } : g
    )
  })),
}));

// Goals Store
export const useGoalsStore = create((set) => ({
  goals: [],
  loading: false,
  
  setGoals: (goals) => set({ goals }),
  setLoading: (loading) => set({ loading }),
  
  addGoal: (goal) => set((state) => ({
    goals: [...state.goals, goal]
  })),
  
  updateGoal: (id, updates) => set((state) => ({
    goals: state.goals.map((g) =>
      g.id === id ? { ...g, ...updates } : g
    )
  })),
  
  deleteGoal: (id) => set((state) => ({
    goals: state.goals.filter((g) => g.id !== id)
  })),
}));

// Calendar Store
export const useCalendarStore = create((set) => ({
  selectedDate: new Date(),
  viewMode: 'month', // 'week' | 'month'
  scheduledWorkouts: [],
  vacations: [],
  missedDays: [],
  
  setSelectedDate: (date) => set({ selectedDate: date }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setScheduledWorkouts: (workouts) => set({ scheduledWorkouts: workouts }),
  setVacations: (vacations) => set({ vacations }),
  setMissedDays: (days) => set({ missedDays: days }),
  
  addVacation: (vacation) => set((state) => ({
    vacations: [...state.vacations, vacation]
  })),
  
  addMissedDay: (day) => set((state) => ({
    missedDays: [...state.missedDays, day]
  })),
}));

// UI Store
export const useUIStore = create((set) => ({
  sidebarOpen: true,
  chatOpen: false,
  activeModal: null,
  
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),
  setChatOpen: (open) => set({ chatOpen: open }),
  setActiveModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
}));

// Token Usage Store (for admin dashboard)
export const useTokenStore = create((set) => ({
  usage: [],
  totalTokens: 0,
  loading: false,
  filters: {
    userId: null,
    startDate: null,
    endDate: null,
  },
  
  setUsage: (usage) => set({ usage }),
  setTotalTokens: (total) => set({ totalTokens: total }),
  setLoading: (loading) => set({ loading }),
  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters }
  })),
  resetFilters: () => set({
    filters: { userId: null, startDate: null, endDate: null }
  }),
}));
