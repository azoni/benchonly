import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import WorkoutsPage from './pages/WorkoutsPage'
import NewWorkoutPage from './pages/NewWorkoutPage'
import WorkoutDetailPage from './pages/WorkoutDetailPage'
import GroupWorkoutPage from './pages/GroupWorkoutPage'
import CalendarPage from './pages/CalendarPage'
import GroupsPage from './pages/GroupsPage'
import GroupDetailPage from './pages/GroupDetailPage'
import GoalsPage from './pages/GoalsPage'
import ToolsPage from './pages/ToolsPage'
import HealthPage from './pages/HealthPage'
import UsagePage from './pages/UsagePage'
import SettingsPage from './pages/SettingsPage'
import AdminPage from './pages/AdminPage'
import FeedPage from './pages/FeedPage'
import ProfilePage from './pages/ProfilePage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="min-h-screen bg-iron-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-iron-400 font-medium">Loading...</p>
        </div>
      </div>
    )
  }
  
  if (!user) {
    return <Navigate to="/login" replace />
  }
  
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="min-h-screen bg-iron-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  
  if (user) {
    return <Navigate to="/" replace />
  }
  
  return children
}

function GuestRoute() {
  const { user, loading, signInAsGuest } = useAuth()
  
  useEffect(() => {
    if (!loading && !user) {
      signInAsGuest()
    }
  }, [loading, user, signInAsGuest])
  
  if (loading) {
    return (
      <div className="min-h-screen bg-iron-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  
  if (user) {
    return <Navigate to="/dashboard" replace />
  }
  
  return null
}

export default function App() {
  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        } 
      />
      
      <Route path="/guest" element={<GuestRoute />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="workouts" element={<WorkoutsPage />} />
        <Route path="workouts/new" element={<NewWorkoutPage />} />
        <Route path="workouts/:id" element={<WorkoutDetailPage />} />
        <Route path="workouts/:id/edit" element={<NewWorkoutPage />} />
        <Route path="workouts/group/:id" element={<GroupWorkoutPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="groups/:id" element={<GroupDetailPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="tools" element={<ToolsPage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="feed" element={<FeedPage />} />
        <Route path="profile/:userId" element={<ProfilePage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}