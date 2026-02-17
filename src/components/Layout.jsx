import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Target,
  Settings,
  MessageCircle,
  Menu,
  X,
  LogOut,
  Dumbbell,
  ChevronRight,
  Eye,
  Home,
  User,
  Activity,
  Bell,
  Zap,
  Layers,
  BookOpen,
  ClipboardList,
  Video,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUIStore } from '../store';
import AIChatPanel from './AIChatPanel';
import InstallPrompt from './InstallPrompt';
import ErrorBoundary from './ErrorBoundary';
import { analyticsService } from '../services/analyticsService';
import { groupWorkoutService, trainerService } from '../services/firestore';
import { notificationService } from '../services/feedService';

const ADMIN_EMAILS = ['charltonuw@gmail.com'];

const baseNavItems = [
  { path: '/today', icon: Home, label: 'Today', badgeKey: 'workouts' },
  { path: '/workouts', icon: Dumbbell, label: 'Workouts' },
  { path: '/programs', icon: Layers, label: 'Programs', beta: true },
  { path: '/groups', icon: Users, label: 'Groups' },
  { path: '/feed', icon: Activity, label: 'Feed' },
  { path: '/goals', icon: Target, label: 'Goals' },
  { path: '/docs', icon: BookOpen, label: 'Docs' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile, signOut, signInWithGoogle, isGuest, isRealAdmin, realUser, impersonating, stopImpersonating } = useAuth();
  const { sidebarOpen, setSidebarOpen, chatOpen, toggleChat } = useUIStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [fabExpanded, setFabExpanded] = useState(false);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  // Load pending review count
  useEffect(() => {
    if (user && !isGuest) {
      groupWorkoutService.getPendingReviews(user.uid)
        .then(reviews => setPendingReviewCount(reviews.length))
        .catch(err => console.error('[Layout]', err.message));
    }
  }, [user, isGuest, location.pathname]);

  // Load unread notification count
  useEffect(() => {
    if (user && !isGuest) {
      notificationService.getUnread(user.uid)
        .then(notifs => setUnreadNotifCount(notifs.length))
        .catch(err => console.error('[Layout]', err.message));
    }
  }, [user, isGuest, location.pathname]);

  // Set admin context for analytics tagging
  useEffect(() => {
    if (isRealAdmin && realUser?.uid) {
      analyticsService.setAdminContext(realUser.uid)
    } else {
      analyticsService.clearAdminContext()
    }
  }, [isRealAdmin, realUser?.uid])

  // Track page views
  useEffect(() => {
    if (user && !isGuest) {
      analyticsService.logPageView(user.uid, location.pathname)
    }
  }, [location.pathname, user, isGuest])

  const isAdmin = isRealAdmin;
  const isTrainer = trainerService.isTrainer(userProfile, user?.email);
  
  // Build nav items based on roles
  const navItems = (() => {
    let items = [...baseNavItems];
    if (isTrainer) {
      items.push({ path: '/trainer', icon: ClipboardList, label: 'Trainer', isTrainer: true });
    }
    if (isAdmin) {
      items.push({ path: '/admin', icon: Settings, label: 'Admin', isAdmin: true });
    }
    return items;
  })();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-iron-950 flex overflow-x-hidden">
      {/* Guest Mode Banner - positioned below mobile header */}
      {isGuest && (
        <div className="fixed left-0 right-0 z-30 bg-gradient-to-r from-flame-600 to-flame-500 text-white py-2.5 px-4
          top-14 lg:top-0">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <Eye className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Demo Mode — your data won't be saved</span>
              <span className="sm:hidden truncate">Demo Mode</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleSignOut}
                className="px-3 py-1 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-md transition-colors"
              >
                Exit Demo
              </button>
              <button
                onClick={signInWithGoogle}
                className="px-3 py-1 text-xs font-semibold bg-white text-flame-600 hover:bg-white/90 rounded-md transition-colors"
              >
                Sign Up Free
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-30
          ${sidebarOpen ? 'w-64' : 'w-20'} 
          ${isGuest ? 'top-10' : 'top-0'}
          bg-iron-900/80 backdrop-blur-sm border-r border-iron-800
          transition-all duration-300`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-iron-800">
          <Link to="/today" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-plate bg-flame-500 flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-display text-xl text-iron-50 tracking-wide"
              >
                BENCH ONLY
              </motion.span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path === '/today' && (location.pathname === '/' || location.pathname === '/today'));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-plate
                  transition-all duration-200 group relative
                  ${isActive
                    ? 'bg-flame-500/10 text-flame-500'
                    : 'text-iron-400 hover:text-iron-100 hover:bg-iron-800/50'
                  }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-flame-500 rounded-r"
                  />
                )}
                <div className="relative flex-shrink-0">
                  <item.icon className="w-5 h-5" />
                  {item.badgeKey === 'workouts' && pendingReviewCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {pendingReviewCount > 9 ? '9+' : pendingReviewCount}
                    </span>
                  )}
                  {item.path === '/feed' && unreadNotifCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-flame-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                    </span>
                  )}
                </div>
                {sidebarOpen && (
                  <>
                    <span className="font-medium">{item.label}</span>
                    {item.beta && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium leading-none">Beta</span>}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-iron-800">
          {!isGuest && sidebarOpen && userProfile?.credits !== undefined && (
            <Link
              to="/settings"
              className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-iron-800/50 hover:bg-iron-800 transition-colors"
            >
              <Zap className="w-4 h-4 text-flame-400" />
              <span className="text-sm text-iron-300"><span className="font-medium text-iron-200">{userProfile.credits}</span> credits</span>
            </Link>
          )}
          <div className={`flex items-center gap-3 ${sidebarOpen ? '' : 'justify-center'}`}>
            <img
              src={user?.photoURL || '/default-avatar.png'}
              alt={user?.displayName}
              className="w-9 h-9 rounded-full border-2 border-iron-700"
            />
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-iron-100 truncate">
                  {user?.displayName}
                </p>
                <p className="text-xs text-iron-500 truncate">
                  {userProfile?.role || 'Member'}
                </p>
              </div>
            )}
          </div>
          
          {sidebarOpen && (
            <button
              onClick={handleSignOut}
              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2
                text-iron-400 hover:text-red-400 bg-iron-800/50 hover:bg-red-500/10
                rounded-plate transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-20 w-6 h-6 bg-iron-800 border border-iron-700
            rounded-full flex items-center justify-center text-iron-400
            hover:text-iron-100 hover:border-iron-600 transition-colors"
        >
          <ChevronRight className={`w-4 h-4 transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 inset-x-0 bg-iron-900 border-b border-iron-800 z-40"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="h-14 flex items-center justify-between px-4">
          <Link to="/today" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-flame-500 flex items-center justify-center flex-shrink-0">
              <Dumbbell className="w-5 h-5 text-white" />
            </div>
            <span className="font-display text-xl text-iron-50 tracking-wide">BENCH ONLY</span>
          </Link>
          
          <div className="flex items-center gap-1">
            {!isGuest && userProfile?.credits !== undefined && (
              <Link
                to="/settings"
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-iron-800/80 mr-1"
              >
                <Zap className="w-3 h-3 text-flame-400" />
                <span className="text-xs font-medium text-iron-300">{userProfile.credits}</span>
              </Link>
            )}
            {unreadNotifCount > 0 && (
              <Link
                to="/feed"
                className="w-10 h-10 flex items-center justify-center text-iron-300 relative"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-flame-500 rounded-full text-[10px] text-white flex items-center justify-center font-medium">
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </span>
              </Link>
            )}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="w-12 h-12 flex items-center justify-center text-iron-300 active:bg-iron-800 rounded-xl transition-colors"
            >
              <Menu className="w-7 h-7" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Floating Buttons — Speed Dial */}
      <div className="lg:hidden fixed bottom-6 right-4 z-30 flex flex-col items-end gap-3"
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <AnimatePresence>
          {fabExpanded && location.pathname !== '/form-check' && (
            <motion.button
              key="fab-formcheck"
              initial={{ opacity: 0, scale: 0.3, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.3, y: 20 }}
              transition={{ duration: 0.2 }}
              onClick={() => { navigate('/form-check'); setFabExpanded(false) }}
              className="w-11 h-11 bg-iron-800 border border-iron-700
                rounded-full shadow-lg flex items-center justify-center transition-colors relative"
            >
              <Video className="w-5 h-5 text-purple-400" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500 text-[7px] font-bold text-white flex items-center justify-center">β</span>
            </motion.button>
          )}
          {fabExpanded && (
            <motion.button
              key="fab-chat"
              initial={{ opacity: 0, scale: 0.3, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.3, y: 20 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              onClick={() => { toggleChat(); setFabExpanded(false) }}
              className="w-11 h-11 bg-flame-500
                rounded-full shadow-lg flex items-center justify-center transition-colors"
            >
              <MessageCircle className="w-5 h-5 text-white" />
            </motion.button>
          )}
        </AnimatePresence>
        <button
          onClick={() => setFabExpanded(!fabExpanded)}
          className={`w-14 h-14 rounded-full shadow-lg shadow-flame-500/30
            flex items-center justify-center transition-all duration-200
            ${fabExpanded ? 'bg-iron-700 rotate-0' : 'bg-flame-500 hover:bg-flame-600 active:bg-flame-700'}`}
        >
          {fabExpanded
            ? <X className="w-6 h-6 text-white" />
            : <MessageCircle className="w-6 h-6 text-white" />
          }
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:hidden fixed right-0 top-0 bottom-0 w-72 bg-iron-900 z-50
                border-l border-iron-800 flex flex-col"
            >
              <div className="h-14 flex items-center justify-between px-4 border-b border-iron-800">
                <span className="font-display text-lg text-iron-50">Menu</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-iron-400 hover:text-iron-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <nav className="flex-1 py-4 px-3 space-y-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path || (item.path === '/today' && (location.pathname === '/' || location.pathname === '/today'));
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-4 px-4 py-4 rounded-plate
                        transition-colors
                        ${isActive
                          ? 'bg-flame-500/10 text-flame-500'
                          : 'text-iron-400 hover:text-iron-100 hover:bg-iron-800/50'
                        }`}
                    >
                      <div className="relative">
                        <item.icon className="w-6 h-6" />
                        {item.badgeKey === 'workouts' && pendingReviewCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {pendingReviewCount > 9 ? '9+' : pendingReviewCount}
                          </span>
                        )}
                        {item.path === '/feed' && unreadNotifCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-flame-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                          </span>
                        )}
                      </div>
                      <span className="font-medium text-lg">{item.label}</span>
                      {item.beta && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium leading-none">Beta</span>}
                    </Link>
                  );
                })}
              </nav>
              
              <div className="p-4 border-t border-iron-800">
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={user?.photoURL || '/default-avatar.png'}
                    alt={user?.displayName}
                    className="w-10 h-10 rounded-full border-2 border-iron-700"
                  />
                  <div>
                    <p className="font-medium text-iron-100">{user?.displayName}</p>
                    <p className="text-sm text-iron-500">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                    text-red-400 bg-red-500/10 hover:bg-red-500/20
                    rounded-plate transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className={`flex-1 min-w-0 transition-all duration-300
        ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}
        ${isGuest ? 'pt-[calc(env(safe-area-inset-top,0px)+3.5rem+2.5rem)] lg:pt-16' : 'pt-[calc(env(safe-area-inset-top,0px)+3.5rem)] lg:pt-0'}`}
      >
        <div className="min-h-screen p-4 lg:p-6 overflow-x-hidden">
          {/* Impersonation Banner */}
          {impersonating && (
            <div className="mb-4 -mt-1 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 flex-wrap">
              <Eye className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="text-sm text-amber-300 font-medium">
                Viewing as {impersonating.displayName || impersonating.email}
              </span>
              <button
                onClick={() => { stopImpersonating(); navigate('/admin'); }}
                className="ml-auto px-3 py-1 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg transition-colors"
              >
                Exit
              </button>
            </div>
          )}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* Floating Buttons (Desktop) */}
      <div className={`hidden lg:flex fixed bottom-6 right-6 z-30 flex-col gap-3 transition-all duration-200
        ${chatOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
      >
        {location.pathname !== '/form-check' && (
          <button
            onClick={() => navigate('/form-check')}
            className="w-11 h-11 rounded-full bg-iron-800 border border-iron-700 text-purple-400
              flex items-center justify-center shadow-lg relative
              hover:bg-iron-700 transition-all duration-200"
            title="Form Check (Beta)"
          >
            <Video className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500 text-[7px] font-bold text-white flex items-center justify-center">β</span>
          </button>
        )}
        <button
          onClick={toggleChat}
          className="w-14 h-14 rounded-full bg-flame-500 text-white
            flex items-center justify-center shadow-glow-lg
            hover:bg-flame-400 transition-all duration-200"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      </div>

      {/* AI Chat Panel */}
      <InstallPrompt />
      <AIChatPanel />
    </div>
  );
}
