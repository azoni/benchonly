import { useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Target,
  BarChart3,
  Settings,
  MessageCircle,
  Menu,
  X,
  LogOut,
  Dumbbell,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUIStore } from '../store';
import AIChatPanel from './AIChatPanel';

const ADMIN_EMAILS = ['charltonuw@gmail.com'];

const baseNavItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/workouts', icon: Dumbbell, label: 'Workouts' },
  { path: '/calendar', icon: Calendar, label: 'Calendar' },
  { path: '/groups', icon: Users, label: 'Groups' },
  { path: '/goals', icon: Target, label: 'Goals' },
  { path: '/usage', icon: BarChart3, label: 'Usage' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile, signOut, isGuest } = useAuth();
  const { sidebarOpen, setSidebarOpen, chatOpen, toggleChat } = useUIStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);
  
  // Add admin nav item if user is admin
  const navItems = isAdmin 
    ? [...baseNavItems, { path: '/admin', icon: Settings, label: 'Admin', isAdmin: true }]
    : baseNavItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-iron-950 flex">
      {/* Guest Mode Banner - positioned below mobile header */}
      {isGuest && (
        <div className="fixed left-0 right-0 z-30 bg-gradient-to-r from-flame-600 to-flame-500 text-white py-2 px-4 text-center text-sm
          top-14 lg:top-0">
          <Eye className="w-4 h-4 inline mr-2" />
          <span className="hidden sm:inline">Guest Mode - Data won't be saved. </span>
          <span className="sm:hidden">Guest Mode </span>
          <button onClick={handleSignOut} className="underline ml-1 font-semibold hover:no-underline">
            Sign in
          </button>
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
          <Link to="/dashboard" className="flex items-center gap-3">
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
            const isActive = location.pathname === item.path;
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
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <span className="font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-iron-800">
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
      <header className="lg:hidden fixed top-0 inset-x-0 h-14 bg-iron-900/90 backdrop-blur-sm
        border-b border-iron-800 z-40 flex items-center justify-between px-3 safe-top">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-plate bg-flame-500 flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-white" />
          </div>
          <span className="font-display text-lg text-iron-50">BENCH ONLY</span>
        </Link>
        
        <div className="flex items-center gap-1">
          <button
            onClick={toggleChat}
            className="p-3 text-iron-400 hover:text-iron-100 active:bg-iron-800 rounded-lg transition-colors"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-3 text-iron-400 hover:text-iron-100 active:bg-iron-800 rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

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
                  const isActive = location.pathname === item.path;
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
                      <item.icon className="w-6 h-6" />
                      <span className="font-medium text-lg">{item.label}</span>
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
      <main className={`flex-1 transition-all duration-300
        ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}
        ${isGuest ? 'pt-24 lg:pt-16' : 'pt-14 lg:pt-0'}`}
      >
        <div className="min-h-screen p-4 lg:p-6">
          <Outlet />
        </div>
      </main>

      {/* AI Chat Button (Desktop) */}
      <button
        onClick={toggleChat}
        className={`hidden lg:flex fixed bottom-6 right-6 z-30
          w-14 h-14 rounded-full bg-flame-500 text-white
          items-center justify-center shadow-glow-lg
          hover:bg-flame-400 transition-all duration-200
          ${chatOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* AI Chat Panel */}
      <AIChatPanel />
    </div>
  );
}