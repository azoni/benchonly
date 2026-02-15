import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

// Eagerly load the two most common entry points
import LoginPage from './pages/LoginPage'
import TodayPage from './pages/TodayPage'

// Lazy load everything else — these only download when the user navigates to them
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const WorkoutsPage = lazy(() => import('./pages/WorkoutsPage'))
const NewWorkoutPage = lazy(() => import('./pages/NewWorkoutPage'))
const WorkoutDetailPage = lazy(() => import('./pages/WorkoutDetailPage'))
const GroupWorkoutPage = lazy(() => import('./pages/GroupWorkoutPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const GroupsPage = lazy(() => import('./pages/GroupsPage'))
const GroupDetailPage = lazy(() => import('./pages/GroupDetailPage'))
const GoalsPage = lazy(() => import('./pages/GoalsPage'))
const ToolsPage = lazy(() => import('./pages/ToolsPage'))
const HealthPage = lazy(() => import('./pages/HealthPage'))
const UsagePage = lazy(() => import('./pages/UsagePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const FeedPage = lazy(() => import('./pages/FeedPage'))
const FriendsPage = lazy(() => import('./pages/FriendsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const GenerateWorkoutPage = lazy(() => import('./pages/GenerateWorkoutPage'))
const ProgramsPage = lazy(() => import('./pages/ProgramsPage'))
const ProgramDetailPage = lazy(() => import('./pages/ProgramDetailPage'))
const DocsPage = lazy(() => import('./pages/DocsPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const TrainerPage = lazy(() => import('./pages/TrainerPage'))
const FormCheckPage = lazy(() => import('./pages/FormCheckPage'))

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, userProfile, loading, isGuest } = useAuth()
  
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

  // Redirect new users to onboarding (skip for guests)
  if (!isGuest && userProfile && userProfile.onboardingComplete === false) {
    return <Navigate to="/onboarding" replace />
  }
  
  return children
}

function OnboardingRoute({ children }) {
  const { user, userProfile, loading, isGuest } = useAuth()
  const preview = new URLSearchParams(window.location.search).has('preview')
  
  if (loading) {
    return (
      <div className="min-h-screen bg-iron-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  
  if (!user) return <Navigate to="/login" replace />
  
  // Already onboarded? Go to today (unless previewing)
  if (!preview && (isGuest || userProfile?.onboardingComplete !== false)) {
    return <Navigate to="/today" replace />
  }
  
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  const preview = new URLSearchParams(window.location.search).has('preview')
  
  if (loading) {
    return (
      <div className="min-h-screen bg-iron-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  
  if (user && !preview) {
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
    return <Navigate to="/today" replace />
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

      <Route path="/docs" element={<Suspense fallback={<PageLoader />}><DocsPage /></Suspense>} />
      
      <Route 
        path="/onboarding" 
        element={
          <OnboardingRoute>
            <Suspense fallback={<PageLoader />}><OnboardingPage /></Suspense>
          </OnboardingRoute>
        } 
      />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TodayPage />} />
        <Route path="today" element={<TodayPage />} />
        <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
        <Route path="workouts" element={<Suspense fallback={<PageLoader />}><WorkoutsPage /></Suspense>} />
        <Route path="workouts/group/:id" element={<Suspense fallback={<PageLoader />}><GroupWorkoutPage /></Suspense>} />
        <Route path="workouts/generate" element={<Suspense fallback={<PageLoader />}><GenerateWorkoutPage /></Suspense>} /> 
        <Route path="workouts/new" element={<Suspense fallback={<PageLoader />}><NewWorkoutPage /></Suspense>} />
        <Route path="workouts/:id/edit" element={<Suspense fallback={<PageLoader />}><NewWorkoutPage /></Suspense>} />
        <Route path="workouts/:id" element={<Suspense fallback={<PageLoader />}><WorkoutDetailPage /></Suspense>} />
        <Route path="calendar" element={<Suspense fallback={<PageLoader />}><CalendarPage /></Suspense>} />
        <Route path="programs" element={<Suspense fallback={<PageLoader />}><ProgramsPage /></Suspense>} />
        <Route path="programs/:id" element={<Suspense fallback={<PageLoader />}><ProgramDetailPage /></Suspense>} />
        <Route path="groups" element={<Suspense fallback={<PageLoader />}><GroupsPage /></Suspense>} />
        <Route path="groups/:id" element={<Suspense fallback={<PageLoader />}><GroupDetailPage /></Suspense>} />
        <Route path="goals" element={<Suspense fallback={<PageLoader />}><GoalsPage /></Suspense>} />
        <Route path="tools" element={<Suspense fallback={<PageLoader />}><ToolsPage /></Suspense>} />
        <Route path="form-check" element={<Suspense fallback={<PageLoader />}><FormCheckPage /></Suspense>} />
        <Route path="health" element={<Suspense fallback={<PageLoader />}><HealthPage /></Suspense>} />
        <Route path="feed" element={<Suspense fallback={<PageLoader />}><FeedPage /></Suspense>} />
        <Route path="friends" element={<Suspense fallback={<PageLoader />}><FriendsPage /></Suspense>} />
        <Route path="profile/:userId" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
        <Route path="profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
        <Route path="usage" element={<Suspense fallback={<PageLoader />}><UsagePage /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
        <Route path="trainer" element={<Suspense fallback={<PageLoader />}><TrainerPage /></Suspense>} />
        <Route path="admin" element={<Suspense fallback={<PageLoader />}><AdminPage /></Suspense>} />
      </Route>
      
      <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFoundPage /></Suspense>} />
    </Routes>
  )
}