import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Dumbbell, 
  ArrowRight, 
  Users, 
  Target, 
  Calendar, 
  Sparkles, 
  Play,
  TrendingUp,
  Zap,
  BarChart3,
  Heart,
  CheckCircle,
  Layout,
  Activity,
  Brain,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, signInWithGoogle, signInAsGuest, loading } = useAuth();
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Auto-rotate features
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % 4);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleGoogleSignIn = async () => {
    const result = await signInWithGoogle();
    if (result.success) {
      navigate('/dashboard');
    }
  };

  const handleGuestSignIn = () => {
    signInAsGuest();
    navigate('/dashboard');
  };

  const showcaseFeatures = [
    {
      id: 'ai',
      title: 'AI-Powered Workouts',
      subtitle: 'Your personal trainer, always available',
      description: 'Generate personalized workouts based on your history, goals, and current fitness level. Our AI analyzes your pain points, tracks RPE, and adapts recommendations.',
      highlights: ['Analyzes your lift history', 'Avoids exercises causing pain', 'Optimizes for your goals'],
      color: 'flame',
      icon: Sparkles,
    },
    {
      id: 'dashboard',
      title: 'Customizable Dashboard',
      subtitle: 'Your training hub, your way',
      description: 'Drag and drop widgets to create your perfect dashboard. Track what matters - from daily stats to health metrics, calendar, goals, and activity feed.',
      highlights: ['10+ customizable widgets', 'Drag & drop layout', 'Track calories, sleep, PRs'],
      color: 'purple',
      icon: Layout,
    },
    {
      id: 'groups',
      title: 'Group Training',
      subtitle: 'Train together, grow together',
      description: 'Create training groups, assign workouts to members, and track everyone\'s progress. Perfect for coaches, gym buddies, or competitive crews.',
      highlights: ['Assign custom workouts', 'AI generates for entire team', 'View member progress'],
      color: 'cyan',
      icon: Users,
    },
    {
      id: 'analytics',
      title: 'Smart Analytics',
      subtitle: 'Data-driven gains',
      description: 'Visualize your progress with detailed charts and insights. Track PRs, monitor volume, analyze RPE trends, and celebrate streaks.',
      highlights: ['1RM estimations', 'Volume tracking', 'Goal progress charts'],
      color: 'green',
      icon: TrendingUp,
    },
  ];

  const quickFeatures = [
    { icon: Sparkles, title: 'AI Coach' },
    { icon: Target, title: 'Goals' },
    { icon: Users, title: 'Groups' },
    { icon: Layout, title: 'Widgets' },
    { icon: Calendar, title: 'Calendar' },
    { icon: Heart, title: 'Health' },
    { icon: Activity, title: 'Feed' },
    { icon: BarChart3, title: 'Analytics' },
  ];

  const stats = [
    { value: '45+', label: 'Cardio Activities' },
    { value: '10+', label: 'Dashboard Widgets' },
    { value: 'AI', label: 'Workout Generator' },
    { value: 'Free', label: 'To Use' },
  ];

  const currentFeature = showcaseFeatures[activeFeature];

  return (
    <div className="min-h-screen bg-iron-950 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-flame-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px]" />
        <div className="absolute -bottom-40 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px]" />
        
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="py-6 px-6 lg:px-12">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-plate bg-flame-500 flex items-center justify-center shadow-lg shadow-flame-500/20">
                <Dumbbell className="w-6 h-6 text-white" />
              </div>
              <span className="font-display text-2xl text-iron-50 tracking-wider">
                BENCH ONLY
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleGuestSignIn}
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-iron-400 hover:text-iron-200 transition-colors"
              >
                <Play className="w-4 h-4" />
                Try Demo
              </button>
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-iron-900
                  rounded-lg font-medium text-sm hover:bg-iron-100 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          {/* Hero Section */}
          <section className="px-6 py-12 lg:py-16">
            <div className="max-w-7xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                {/* Left side - Hero Text */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-flame-500/10 border border-flame-500/30
                    rounded-full text-flame-400 text-sm mb-6">
                    <Zap className="w-4 h-4" />
                    AI-Powered Training Platform
                  </div>

                  <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl text-iron-50 mb-6 leading-[1.1]">
                    THE SMARTEST
                    <span className="text-gradient block">WAY TO LIFT</span>
                  </h1>

                  <p className="text-xl text-iron-400 mb-8 max-w-lg leading-relaxed">
                    Track workouts, hit PRs, and train with friends. 
                    Powered by AI that actually understands lifting.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 mb-8">
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={loading}
                      className="group flex items-center justify-center gap-3 px-8 py-4 bg-white text-iron-950
                        rounded-plate font-semibold text-lg
                        hover:bg-iron-100 transition-all duration-200
                        disabled:opacity-50 shadow-lg shadow-white/10"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Get Started Free
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      onClick={handleGuestSignIn}
                      className="group flex items-center justify-center gap-3 px-8 py-4 
                        bg-iron-800/50 text-iron-200 border border-iron-700
                        rounded-plate font-medium text-lg
                        hover:bg-iron-800 hover:border-iron-600 transition-all duration-200"
                    >
                      <Play className="w-5 h-5" />
                      Explore Demo
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="flex flex-wrap gap-6 sm:gap-10">
                    {stats.map((stat) => (
                      <div key={stat.label}>
                        <p className="text-2xl sm:text-3xl font-display text-flame-400">{stat.value}</p>
                        <p className="text-sm text-iron-500">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Right side - App Preview */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="relative"
                >
                  <div className="relative mx-auto max-w-md">
                    <div className="absolute inset-0 bg-gradient-to-b from-flame-500/20 to-purple-500/20 rounded-3xl blur-2xl" />
                    <div className="relative bg-iron-900 rounded-3xl border border-iron-800 p-5 shadow-2xl">
                      {/* Mock header */}
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <p className="text-xs text-iron-500">Good morning</p>
                          <p className="font-display text-lg text-iron-100">Let's crush it 💪</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-flame-500 to-purple-500 flex items-center justify-center">
                          <span className="text-white font-medium text-sm">JD</span>
                        </div>
                      </div>
                      
                      {/* Mock stats grid */}
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="bg-iron-800 rounded-xl p-3 text-center">
                          <p className="text-2xl font-display text-flame-400">4</p>
                          <p className="text-[10px] text-iron-500">This Week</p>
                        </div>
                        <div className="bg-iron-800 rounded-xl p-3 text-center">
                          <p className="text-2xl font-display text-green-400">225</p>
                          <p className="text-[10px] text-iron-500">Bench PR</p>
                        </div>
                        <div className="bg-iron-800 rounded-xl p-3 text-center">
                          <p className="text-2xl font-display text-purple-400">12</p>
                          <p className="text-[10px] text-iron-500">Day Streak</p>
                        </div>
                      </div>
                      
                      {/* Mock workout card */}
                      <div className="bg-iron-800 rounded-xl p-4 mb-3">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-lg bg-flame-500/20 flex items-center justify-center">
                            <Dumbbell className="w-5 h-5 text-flame-400" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-iron-100">Push Day</p>
                            <p className="text-xs text-iron-500">5 exercises • 45 min</p>
                          </div>
                          <div className="px-2 py-1 bg-green-500/20 rounded text-xs text-green-400 font-medium">
                            Done
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <span className="px-2 py-1 bg-iron-700 rounded text-xs text-iron-300">Bench 185×8</span>
                          <span className="px-2 py-1 bg-iron-700 rounded text-xs text-iron-300">OHP 95×10</span>
                          <span className="px-2 py-1 bg-iron-700 rounded text-xs text-iron-300">+3</span>
                        </div>
                      </div>
                      
                      {/* Mock AI chat preview */}
                      <div className="bg-gradient-to-r from-flame-500/10 to-purple-500/10 border border-flame-500/20 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-4 h-4 text-flame-400" />
                          <span className="text-xs font-medium text-flame-400">AI Coach</span>
                        </div>
                        <p className="text-sm text-iron-300">
                          "Great push day! You're 10 lbs from your bench goal. Try pause reps next session to break through."
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          {/* Features Strip */}
          <section className="px-6 py-6 border-y border-iron-800/50 bg-iron-900/30">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
                {quickFeatures.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-iron-400">
                    <f.icon className="w-4 h-4 text-flame-400" />
                    <span className="text-sm">{f.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Feature Showcase */}
          <section className="px-6 py-20">
            <div className="max-w-7xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center mb-12"
              >
                <h2 className="font-display text-3xl sm:text-4xl text-iron-100 mb-4">
                  Everything You Need to Level Up
                </h2>
                <p className="text-iron-400 max-w-2xl mx-auto">
                  From AI-powered workouts to team training, we've built the complete platform for serious lifters.
                </p>
              </motion.div>

              {/* Feature Tabs */}
              <div className="flex justify-center gap-2 mb-10 flex-wrap">
                {showcaseFeatures.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFeature(i)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      activeFeature === i
                        ? f.color === 'flame' ? 'bg-flame-500 text-white'
                        : f.color === 'purple' ? 'bg-purple-500 text-white'
                        : f.color === 'cyan' ? 'bg-cyan-500 text-white'
                        : 'bg-green-500 text-white'
                        : 'bg-iron-800 text-iron-400 hover:text-iron-200'
                    }`}
                  >
                    <f.icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{f.title.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              {/* Feature Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeFeature}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="grid lg:grid-cols-2 gap-12 items-center"
                >
                  {/* Text Side */}
                  <div className={`${activeFeature % 2 === 1 ? 'lg:order-2' : ''}`}>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm mb-4 ${
                      currentFeature.color === 'flame' ? 'bg-flame-500/10 text-flame-400'
                      : currentFeature.color === 'purple' ? 'bg-purple-500/10 text-purple-400'
                      : currentFeature.color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400'
                      : 'bg-green-500/10 text-green-400'
                    }`}>
                      <currentFeature.icon className="w-4 h-4" />
                      {currentFeature.subtitle}
                    </div>
                    <h3 className="font-display text-3xl text-iron-100 mb-4">
                      {currentFeature.title}
                    </h3>
                    <p className="text-iron-400 mb-6 leading-relaxed">
                      {currentFeature.description}
                    </p>
                    <ul className="space-y-3">
                      {currentFeature.highlights.map((h, i) => (
                        <li key={i} className="flex items-center gap-3 text-iron-300">
                          <CheckCircle className={`w-5 h-5 flex-shrink-0 ${
                            currentFeature.color === 'flame' ? 'text-flame-400'
                            : currentFeature.color === 'purple' ? 'text-purple-400'
                            : currentFeature.color === 'cyan' ? 'text-cyan-400'
                            : 'text-green-400'
                          }`} />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Preview Side */}
                  <div className={`${activeFeature % 2 === 1 ? 'lg:order-1' : ''}`}>
                    <div className="relative">
                      <div className={`absolute inset-0 rounded-2xl blur-2xl opacity-50 ${
                        currentFeature.color === 'flame' ? 'bg-flame-500/20'
                        : currentFeature.color === 'purple' ? 'bg-purple-500/20'
                        : currentFeature.color === 'cyan' ? 'bg-cyan-500/20'
                        : 'bg-green-500/20'
                      }`} />
                      
                      {/* Feature-specific mockup */}
                      <div className="relative bg-iron-900 rounded-2xl border border-iron-800 p-6 shadow-xl">
                        {activeFeature === 0 && (
                          /* AI Generator Preview */
                          <div className="space-y-4">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 rounded-xl bg-flame-500/20 flex items-center justify-center">
                                <Brain className="w-5 h-5 text-flame-400" />
                              </div>
                              <div>
                                <p className="font-medium text-iron-100">AI Workout Generator</p>
                                <p className="text-xs text-iron-500">Analyzing your training data...</p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {['Loading workout history', 'Analyzing max lifts', 'Checking pain history', 'Generating workout'].map((step, i) => (
                                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-iron-800/50">
                                  <Check className="w-4 h-4 text-green-400" />
                                  <span className="text-sm text-iron-300">{step}</span>
                                  <span className="ml-auto text-xs text-iron-500">{(i + 1) * 0.3}s</span>
                                </div>
                              ))}
                            </div>
                            <div className="p-4 bg-flame-500/10 border border-flame-500/20 rounded-xl mt-4">
                              <p className="text-xs text-flame-400 mb-2 font-medium">Generated: Push Day A</p>
                              <div className="space-y-1 text-sm text-iron-300">
                                <p>• Bench Press 4×6 @ 175 lbs</p>
                                <p>• Incline DB Press 3×10</p>
                                <p>• OHP 3×8 @ 95 lbs</p>
                                <p>• Tricep Pushdown 3×12</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {activeFeature === 1 && (
                          /* Dashboard Preview */
                          <div className="space-y-3">
                            <p className="text-xs text-iron-500 uppercase tracking-wide mb-3">Drag & Drop Widgets</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-iron-800 rounded-xl p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <Calendar className="w-4 h-4 text-flame-400" />
                                  <span className="text-xs text-iron-400">This Week</span>
                                </div>
                                <p className="text-xl font-display text-flame-400">4</p>
                              </div>
                              <div className="bg-iron-800 rounded-xl p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <Dumbbell className="w-4 h-4 text-purple-400" />
                                  <span className="text-xs text-iron-400">Total</span>
                                </div>
                                <p className="text-xl font-display text-purple-400">127</p>
                              </div>
                            </div>
                            <div className="bg-iron-800 rounded-xl p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Heart className="w-4 h-4 text-red-400" />
                                <span className="text-xs text-iron-400">Health Today</span>
                              </div>
                              <div className="flex gap-4 text-sm text-iron-300">
                                <span>😴 7.5h</span>
                                <span>💧 48oz</span>
                                <span>🥩 145g</span>
                              </div>
                            </div>
                            <div className="bg-iron-800 rounded-xl p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Target className="w-4 h-4 text-green-400" />
                                <span className="text-xs text-iron-400">Active Goals</span>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-iron-300">Bench 225</span>
                                  <span className="text-green-400">90%</span>
                                </div>
                                <div className="h-1.5 bg-iron-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-green-500 rounded-full" style={{ width: '90%' }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {activeFeature === 2 && (
                          /* Groups Preview */
                          <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-iron-800 rounded-xl">
                              <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                                <Users className="w-5 h-5 text-cyan-400" />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-iron-100">Morning Crew</p>
                                <p className="text-xs text-iron-500">5 athletes • Push Day assigned</p>
                              </div>
                            </div>
                            <p className="text-xs text-iron-500 uppercase tracking-wide">Workout Progress</p>
                            <div className="space-y-2">
                              {[
                                { name: 'Alex', status: 'Completed', color: 'green' },
                                { name: 'Jordan', status: 'Completed', color: 'green' },
                                { name: 'Sam', status: 'In Progress', color: 'yellow' },
                                { name: 'Taylor', status: 'Pending', color: 'iron' },
                              ].map((m, i) => (
                                <div key={i} className="flex items-center justify-between p-2.5 bg-iron-800/50 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-iron-700 flex items-center justify-center text-xs text-iron-400">
                                      {m.name[0]}
                                    </div>
                                    <span className="text-sm text-iron-300">{m.name}</span>
                                  </div>
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    m.color === 'green' ? 'bg-green-500/20 text-green-400' 
                                    : m.color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' 
                                    : 'bg-iron-700 text-iron-500'
                                  }`}>{m.status}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {activeFeature === 3 && (
                          /* Analytics Preview */
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-iron-800 rounded-xl p-3 text-center">
                                <p className="text-2xl font-display text-green-400">225</p>
                                <p className="text-xs text-iron-500">Bench 1RM</p>
                                <p className="text-[10px] text-green-400">↑ 10 lbs</p>
                              </div>
                              <div className="bg-iron-800 rounded-xl p-3 text-center">
                                <p className="text-2xl font-display text-green-400">315</p>
                                <p className="text-xs text-iron-500">Squat 1RM</p>
                                <p className="text-[10px] text-green-400">↑ 15 lbs</p>
                              </div>
                            </div>
                            <div className="bg-iron-800 rounded-xl p-3">
                              <p className="text-xs text-iron-500 mb-3">Bench Progress (8 weeks)</p>
                              <div className="h-24 flex items-end gap-1.5">
                                {[55, 60, 58, 65, 70, 68, 75, 82, 80, 88, 92, 100].map((h, i) => (
                                  <div 
                                    key={i} 
                                    className="flex-1 bg-gradient-to-t from-green-600 to-green-400 rounded-t transition-all hover:from-green-500 hover:to-green-300"
                                    style={{ height: `${h}%` }}
                                  />
                                ))}
                              </div>
                              <div className="flex justify-between mt-2 text-[10px] text-iron-600">
                                <span>Jan</span>
                                <span>Feb</span>
                                <span>Mar</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Navigation dots */}
              <div className="flex justify-center gap-2 mt-8">
                {showcaseFeatures.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveFeature(i)}
                    className={`h-2 rounded-full transition-all ${
                      activeFeature === i ? 'w-8 bg-flame-500' : 'w-2 bg-iron-700 hover:bg-iron-600'
                    }`}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="px-6 py-20">
            <div className="max-w-4xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <h2 className="font-display text-4xl sm:text-5xl text-iron-100 mb-6">
                  Ready to Get Stronger?
                </h2>
                <p className="text-xl text-iron-400 mb-8 max-w-2xl mx-auto">
                  Join lifters who are already crushing their goals. It's completely free to start.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="group flex items-center justify-center gap-3 px-8 py-4 bg-flame-500 text-white
                      rounded-plate font-semibold text-lg
                      hover:bg-flame-600 transition-all duration-200
                      disabled:opacity-50 shadow-lg shadow-flame-500/20"
                  >
                    Start Training Now
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button
                    onClick={handleGuestSignIn}
                    className="flex items-center justify-center gap-3 px-8 py-4 
                      bg-iron-800 text-iron-200 border border-iron-700
                      rounded-plate font-medium text-lg
                      hover:bg-iron-700 transition-all duration-200"
                  >
                    <Play className="w-5 h-5" />
                    Explore Demo
                  </button>
                </div>
              </motion.div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="py-8 px-6 lg:px-12 border-t border-iron-800/50">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-flame-500 flex items-center justify-center">
                  <Dumbbell className="w-4 h-4 text-white" />
                </div>
                <span className="font-display text-lg text-iron-400">BENCH ONLY</span>
              </div>
              <p className="text-sm text-iron-500">
                © 2025 BENCH ONLY. Built for serious lifters.
              </p>
              <div className="flex items-center gap-6">
                <a href="/privacy" className="text-sm text-iron-500 hover:text-iron-300 transition-colors">Privacy</a>
                <a href="/terms" className="text-sm text-iron-500 hover:text-iron-300 transition-colors">Terms</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}