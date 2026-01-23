import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  MessageCircle,
  Heart
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, signInWithGoogle, signInAsGuest, loading } = useAuth();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

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

  const features = [
    {
      icon: Sparkles,
      title: 'AI Coach',
      description: 'Get personalized workout suggestions and form tips from your AI training partner.',
    },
    {
      icon: Users,
      title: 'Train Together',
      description: 'Create groups, assign workouts, and track attendance with your gym crew.',
    },
    {
      icon: Target,
      title: 'Goal Tracking',
      description: 'Set PRs for bench, squat, deadlift and watch your progress over time.',
    },
    {
      icon: BarChart3,
      title: 'Smart Analytics',
      description: 'Visualize your gains with charts, streaks, and detailed workout history.',
    },
    {
      icon: Calendar,
      title: 'Schedule & Plan',
      description: 'Plan your week, set recurring workouts, and never miss a session.',
    },
    {
      icon: Heart,
      title: 'Health Tracking',
      description: 'Log sleep, water, protein and calories to optimize your recovery.',
    },
  ];

  const stats = [
    { value: '500+', label: 'Exercises' },
    { value: '50+', label: 'Cardio Activities' },
    { value: '∞', label: 'Possibilities' },
  ];

  return (
    <div className="min-h-screen bg-iron-950 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-flame-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px]" />
        <div className="absolute -bottom-40 right-1/4 w-[500px] h-[500px] bg-flame-500/10 rounded-full blur-[100px]" />
        
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
              <div className="w-12 h-12 rounded-plate bg-flame-500 flex items-center justify-center">
                <Dumbbell className="w-6 h-6 text-white" />
              </div>
              <span className="font-display text-2xl text-iron-50 tracking-wider">
                BENCH ONLY
              </span>
            </div>
            
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/10 text-white border border-white/20
                rounded-lg font-medium text-sm hover:bg-white/20 transition-all"
            >
              Sign In
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1">
          <section className="px-6 py-12 lg:py-20">
            <div className="max-w-7xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                {/* Left side - Hero Text */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-flame-500/10 border border-flame-500/30
                    rounded-full text-flame-400 text-sm mb-6">
                    <Zap className="w-4 h-4" />
                    Your AI-Powered Gym Partner
                  </div>

                  <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl text-iron-50 mb-6 leading-[1.1]">
                    TRACK.
                    <span className="text-gradient block">TRAIN.</span>
                    <span className="block">TRANSFORM.</span>
                  </h1>

                  <p className="text-xl text-iron-400 mb-8 max-w-lg leading-relaxed">
                    The smartest way to log workouts, hit PRs, and train with friends. 
                    Powered by AI that actually understands lifting.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
                      Try Demo
                    </button>
                  </div>

                  <p className="text-sm text-iron-500">
                    <span className="text-iron-400">Demo mode:</span> Explore with sample data, no account needed
                  </p>

                  {/* Stats */}
                  <div className="flex gap-8 mt-10 pt-10 border-t border-iron-800">
                    {stats.map((stat) => (
                      <div key={stat.label}>
                        <p className="text-3xl font-display text-flame-400">{stat.value}</p>
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
                  {/* Mock phone/app preview */}
                  <div className="relative mx-auto max-w-sm">
                    <div className="absolute inset-0 bg-gradient-to-b from-flame-500/20 to-purple-500/20 rounded-3xl blur-2xl" />
                    <div className="relative bg-iron-900 rounded-3xl border border-iron-800 p-4 shadow-2xl">
                      {/* Mock header */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-xs text-iron-500">Good morning</p>
                          <p className="font-display text-lg text-iron-100">Let's crush it 💪</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-flame-500/20 flex items-center justify-center">
                          <span className="text-sm">👤</span>
                        </div>
                      </div>
                      
                      {/* Mock stats */}
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-iron-800 rounded-xl p-3">
                          <p className="text-xs text-iron-500">This Week</p>
                          <p className="text-xl font-display text-flame-400">4 workouts</p>
                        </div>
                        <div className="bg-iron-800 rounded-xl p-3">
                          <p className="text-xs text-iron-500">Bench PR</p>
                          <p className="text-xl font-display text-green-400">225 lbs</p>
                        </div>
                      </div>
                      
                      {/* Mock workout card */}
                      <div className="bg-iron-800 rounded-xl p-4 mb-3">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-lg bg-flame-500/20 flex items-center justify-center">
                            <Dumbbell className="w-5 h-5 text-flame-400" />
                          </div>
                          <div>
                            <p className="font-medium text-iron-100">Push Day</p>
                            <p className="text-xs text-iron-500">5 exercises • 45 min</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <span className="px-2 py-1 bg-iron-700 rounded text-xs text-iron-300">Bench</span>
                          <span className="px-2 py-1 bg-iron-700 rounded text-xs text-iron-300">OHP</span>
                          <span className="px-2 py-1 bg-iron-700 rounded text-xs text-iron-300">+3</span>
                        </div>
                      </div>
                      
                      {/* Mock AI chat preview */}
                      <div className="bg-gradient-to-r from-flame-500/10 to-purple-500/10 border border-flame-500/20 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-4 h-4 text-flame-400" />
                          <span className="text-xs font-medium text-flame-400">AI Coach</span>
                        </div>
                        <p className="text-sm text-iron-300">
                          "Great session! You're 10 lbs away from your bench goal. Let's add some pause reps next week."
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          {/* Features Grid */}
          <section className="px-6 py-16 bg-iron-900/50">
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
                  From tracking your lifts to competing with friends, we've got you covered.
                </p>
              </motion.div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {features.map((feature, index) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="card-steel p-6 rounded-xl hover:border-iron-600 transition-colors group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-flame-500/10 flex items-center justify-center mb-4 
                      group-hover:bg-flame-500/20 transition-colors">
                      <feature.icon className="w-6 h-6 text-flame-400" />
                    </div>
                    <h3 className="font-display text-lg text-iron-100 mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-iron-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </motion.div>
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
                  Join lifters who are already crushing their goals. It's free to start.
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
        <footer className="py-6 px-6 lg:px-12 border-t border-iron-800/50">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-iron-500">
              © 2025 BENCH ONLY. Built for serious lifters.
            </p>
            <div className="flex items-center gap-6">
              <a href="https://benchpressonly.com/privacy" className="text-sm text-iron-500 hover:text-iron-300">
                Privacy
              </a>
              <a href="https://benchpressonly.com/terms" className="text-sm text-iron-500 hover:text-iron-300">
                Terms
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}