import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Dumbbell, ArrowRight, Users, Target, Calendar, Sparkles, Eye } from 'lucide-react';
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
      title: 'AI-Powered',
      description: 'Get intelligent workout recommendations tailored to your goals.',
    },
    {
      icon: Users,
      title: 'Train Together',
      description: 'Create groups, track attendance, and compete with friends.',
    },
    {
      icon: Calendar,
      title: 'Smart Scheduling',
      description: 'Plan workouts, set recurring days, and manage rest periods.',
    },
    {
      icon: Target,
      title: 'Goal Tracking',
      description: 'Set ambitious targets and watch your progress unfold.',
    },
  ];

  return (
    <div className="min-h-screen bg-iron-950 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-flame-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-flame-500/10 rounded-full blur-3xl" />
        
        {/* Grid pattern */}
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
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-plate bg-flame-500 flex items-center justify-center">
              <Dumbbell className="w-6 h-6 text-white" />
            </div>
            <span className="font-display text-2xl text-iron-50 tracking-wider">
              BENCH ONLY
            </span>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="max-w-6xl w-full grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left side - Hero */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-flame-500/10 border border-flame-500/30
                rounded-full text-flame-400 text-sm mb-6">
                <Sparkles className="w-4 h-4" />
                AI-Powered Training
              </div>

              <h1 className="font-display text-display-xl text-iron-50 mb-4">
                LIFT
                <span className="text-gradient block">SMARTER</span>
              </h1>

              <p className="text-xl text-iron-400 mb-8 max-w-md leading-relaxed">
                Track your workouts, crush your goals, and train with friends. 
                All powered by intelligent AI that adapts to you.
              </p>

              <div className="space-y-3">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="group w-full sm:w-auto flex items-center justify-center gap-4 px-8 py-4 bg-white text-iron-950
                    rounded-plate font-semibold text-lg
                    hover:bg-iron-100 transition-all duration-200
                    disabled:opacity-50"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={handleGuestSignIn}
                  className="group w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 
                    bg-iron-800 text-iron-200 border border-iron-700
                    rounded-plate font-medium text-lg
                    hover:bg-iron-700 hover:border-iron-600 transition-all duration-200"
                >
                  <Eye className="w-5 h-5" />
                  Try as Guest
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              <p className="mt-4 text-sm text-iron-500">
                No credit card required. Free to start.
              </p>
            </motion.div>

            {/* Right side - Features */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="grid grid-cols-2 gap-4"
            >
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                  className="card-steel p-6 rounded-xl border-glow"
                >
                  <div className="w-12 h-12 rounded-plate bg-flame-500/10 flex items-center justify-center mb-4">
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
            </motion.div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-6 px-6 lg:px-12 border-t border-iron-800/50">
          <p className="text-sm text-iron-500 text-center">
            © 2026 BENCH ONLY. Built for serious lifters.
          </p>
        </footer>
      </div>
    </div>
  );
}