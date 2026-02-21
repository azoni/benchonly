import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Dumbbell, 
  ArrowRight, 
  Users, 
  Target, 
  Sparkles, 
  Play,
  TrendingUp,
  Brain,
  Check,
  Loader2,
  Zap,
  Activity,
  Calendar,
  MessageCircle,
  BookOpen,
  Video,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

// AI thinking messages — same ones used in the real generator
const THINKING_STEPS = [
  { text: 'Reviewing your recent training sessions...', icon: 'brain', delay: 0 },
  { text: 'Analyzing strength progression trends...', icon: 'calc', delay: 800 },
  { text: 'Checking for pain history and injury risks...', icon: 'alert', delay: 1600 },
  { text: 'Calculating working weights from your e1RM data...', icon: 'calc', delay: 2400 },
  { text: 'Selecting exercises based on your focus area...', icon: 'dumbbell', delay: 3200 },
  { text: 'Building optimal set and rep schemes...', icon: 'dumbbell', delay: 4000 },
  { text: 'Writing personalized coaching notes...', icon: 'msg', delay: 4800 },
  { text: 'Workout ready!', icon: 'check', delay: 5600 },
];

function AIThinkingDemo() {
  const [visibleSteps, setVisibleSteps] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const containerRef = useRef(null);
  const timersRef = useRef([]);

  const startDemo = () => {
    setVisibleSteps([]);
    setIsRunning(true);
    setHasRun(true);

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    THINKING_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        setVisibleSteps(prev => [...prev, step]);
        if (i === THINKING_STEPS.length - 1) {
          setIsRunning(false);
        }
      }, step.delay);
      timersRef.current.push(t);
    });
  };

  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleSteps]);

  const iconMap = {
    brain: <Brain className="w-3 h-3 text-flame-400" />,
    alert: <span className="w-3 h-3 text-amber-400 text-[10px] leading-none flex items-center justify-center">⚠</span>,
    calc: <Sparkles className="w-3 h-3 text-purple-400" />,
    dumbbell: <Dumbbell className="w-3 h-3 text-cyan-400" />,
    msg: <MessageCircle className="w-3 h-3 text-blue-400" />,
    check: <Check className="w-3 h-3 text-green-400" />,
  };

  return (
    <div className="bg-iron-900/80 rounded-2xl border border-iron-700/50 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-iron-800 bg-iron-900">
        <div className="w-7 h-7 rounded-lg bg-flame-500/20 flex items-center justify-center">
          <Brain className="w-3.5 h-3.5 text-flame-400" />
        </div>
        <span className="text-sm font-medium text-iron-200">AI Workout Generator</span>
        {isRunning && <Loader2 className="w-4 h-4 text-flame-400 animate-spin ml-auto" />}
        {!isRunning && hasRun && <Check className="w-4 h-4 text-green-400 ml-auto" />}
      </div>

      {/* Thinking stream */}
      <div ref={containerRef} className="p-4 min-h-[180px] max-h-[220px] overflow-y-auto">
        {!hasRun ? (
          <div className="flex flex-col items-center justify-center h-[160px] gap-3">
            <p className="text-sm text-iron-500">See how the AI builds your workout</p>
            <button
              onClick={startDemo}
              className="flex items-center gap-2 px-4 py-2 bg-flame-500 hover:bg-flame-600 text-white text-sm rounded-lg transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              Run Demo
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleSteps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-start gap-2.5"
              >
                <div className="mt-0.5 w-5 h-5 rounded bg-iron-800 flex items-center justify-center flex-shrink-0">
                  {iconMap[step.icon]}
                </div>
                <p className={`text-sm leading-relaxed ${step.icon === 'check' ? 'text-green-400 font-medium' : 'text-iron-300'}`}>
                  {step.text}
                </p>
              </motion.div>
            ))}
            {isRunning && (
              <div className="flex items-center gap-1.5 pt-1 ml-7">
                <span className="w-1.5 h-1.5 bg-flame-400 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-flame-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 bg-flame-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            )}
            {!isRunning && hasRun && (
              <button
                onClick={startDemo}
                className="text-xs text-iron-500 hover:text-iron-300 mt-2 ml-7"
              >
                Run again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Inline mockup of Today page
function TodayMockup() {
  return (
    <div className="bg-iron-900/80 rounded-2xl border border-iron-700/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-iron-800">
        <p className="text-[10px] text-iron-500">Tuesday, February 11</p>
        <p className="text-sm font-display text-iron-100">Good morning, Alex</p>
      </div>
      <div className="p-3 space-y-2.5">
        {/* Today's workout card */}
        <div className="bg-iron-800/60 rounded-xl p-3 border border-flame-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-flame-500/10 flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-flame-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-iron-100 truncate">Push Day — Chest & Triceps</p>
              <p className="text-[11px] text-iron-500">6 exercises · AI Generated</p>
            </div>
          </div>
        </div>
        {/* Week dots */}
        <div className="bg-iron-800/40 rounded-xl p-2.5">
          <div className="flex gap-1.5 justify-between">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className={`text-[9px] ${i === 1 ? 'text-flame-400' : 'text-iron-600'}`}>{d}</span>
                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] ${
                  i === 0 ? 'bg-green-500/20 text-green-400' 
                  : i === 1 ? 'bg-flame-500/20 text-flame-400 ring-1 ring-flame-500/30' 
                  : i === 4 ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20'
                  : 'bg-iron-800/50 text-iron-600'
                }`}>
                  {10 + i}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Goal progress */}
        <div className="bg-iron-800/40 rounded-xl p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-iron-400 flex items-center gap-1">
              <Target className="w-3 h-3 text-flame-400" /> Bench Press 225 lbs
            </span>
            <span className="text-[10px] text-flame-400">87%</span>
          </div>
          <div className="h-1.5 bg-iron-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-flame-500 to-flame-400 rounded-full" style={{ width: '87%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Group workout mockup
function GroupMockup() {
  return (
    <div className="bg-iron-900/80 rounded-2xl border border-iron-700/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-iron-800 flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-cyan-500/20 flex items-center justify-center">
          <Users className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <span className="text-sm font-medium text-iron-200">Morning Crew</span>
        <span className="text-[10px] text-iron-500 ml-auto">3 athletes</span>
      </div>
      <div className="p-3 space-y-2">
        {[
          { name: 'You', status: 'Completed', color: 'green' },
          { name: 'Jordan', status: 'In Progress', color: 'amber' },
          { name: 'Sam', status: 'Assigned', color: 'iron' },
        ].map((m, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 px-2.5 bg-iron-800/40 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-iron-700 flex items-center justify-center text-[10px] text-iron-400">
                {m.name[0]}
              </div>
              <span className="text-xs text-iron-300">{m.name}</span>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              m.color === 'green' ? 'bg-green-500/20 text-green-400'
              : m.color === 'amber' ? 'bg-amber-500/20 text-amber-400'
              : 'bg-iron-700 text-iron-500'
            }`}>{m.status}</span>
          </div>
        ))}
        <div className="pt-1 text-[10px] text-iron-500 text-center">
          AI generates personalized weights for each athlete
        </div>
      </div>
    </div>
  );
}

function FormCheckMockup() {
  const mockFrames = [
    { phase: 'Setup', score: 9, color: 'green' },
    { phase: 'Descent', score: 8, color: 'green' },
    { phase: 'Bottom', score: 6, color: 'yellow' },
    { phase: 'Ascent', score: 7, color: 'yellow' },
    { phase: 'Lockout', score: 9, color: 'green' },
  ]
  return (
    <div className="bg-iron-900/80 rounded-2xl border border-iron-700/50 overflow-hidden">
      {/* Score header */}
      <div className="px-4 py-3 border-b border-iron-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
          <span className="text-lg font-display font-bold text-green-400">8</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-iron-200">Barbell Back Squat</p>
          <p className="text-[10px] text-iron-500">Good depth, minor knee cave on ascent</p>
        </div>
        <span className="text-[10px] text-iron-500">5 frames</span>
      </div>
      {/* Frame timeline */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex gap-1 mb-2">
          {mockFrames.map((f, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full ${
                f.color === 'green' ? 'bg-green-500' : 'bg-yellow-500'
              } ${i === 2 ? 'ring-1 ring-white/30' : 'opacity-50'}`}
            />
          ))}
        </div>
        <div className="text-[10px] text-iron-500 flex justify-between">
          <span>Setup</span>
          <span>Lockout</span>
        </div>
      </div>
      {/* Active frame analysis */}
      <div className="px-4 pb-3">
        <div className="bg-iron-800/50 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-yellow-400">Frame 3 · Bottom</span>
            <span className="text-[10px] font-bold text-yellow-400">6/10</span>
          </div>
          <p className="text-[11px] text-iron-400 leading-relaxed">Slight knee cave at the bottom position. Depth is good — hip crease below knee line.</p>
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-flame-400 text-[10px]">→</span>
            <span className="text-[10px] text-iron-500">Push knees out over toes on the way down</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, signInWithGoogle, signInAsGuest, loading } = useAuth();
  const [signInError, setSignInError] = useState(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/today');
    }
  }, [user, navigate]);

  const handleGoogleSignIn = async () => {
    setSignInError(null);
    setSigningIn(true);
    try {
      const result = await signInWithGoogle();
      if (result.success) {
        navigate('/today');
      } else if (result.error !== 'cancelled') {
        setSignInError(result.error);
      }
    } catch (e) {
      setSignInError('Something went wrong. Please try again.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleGuestSignIn = () => {
    signInAsGuest();
    navigate('/today');
  };

  return (
    <div className="min-h-screen bg-iron-950 overflow-x-hidden">
      {/* Subtle background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-32 right-0 w-[500px] h-[500px] bg-flame-500/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 -left-32 w-[400px] h-[400px] bg-cyan-500/[0.04] rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="py-5 px-5 sm:px-8">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-flame-500 flex items-center justify-center shadow-lg shadow-flame-500/20">
                <Dumbbell className="w-5 h-5 text-white" />
              </div>
              <span className="font-display text-xl text-iron-50 tracking-wider">BENCH ONLY</span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/docs"
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-iron-400 hover:text-iron-200 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Docs</span>
              </Link>
              <button
                onClick={handleGuestSignIn}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-sm text-iron-400 hover:text-iron-200 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Try Demo
              </button>
              <button
                onClick={handleGoogleSignIn}
                disabled={loading || signingIn}
                className="flex items-center gap-2 px-4 py-2 bg-white text-iron-900
                  rounded-lg font-medium text-sm hover:bg-iron-100 transition-all disabled:opacity-50"
              >
                {(loading || signingIn) ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign In
                  </>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="px-5 sm:px-8 pt-8 sm:pt-16 pb-12">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="max-w-xl"
            >
              <h1 className="font-display text-display-lg sm:text-display-xl text-iron-50 mb-4">
                TRAIN SMARTER
              </h1>
              <p className="text-lg sm:text-xl text-iron-400 leading-relaxed mb-8">
                AI-powered strength training. Generate personalized workouts, check your form, train with friends, and track everything — all free.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading || signingIn}
                  className="group flex items-center justify-center gap-2.5 px-6 py-3.5 bg-flame-500 text-white
                    rounded-xl font-semibold hover:bg-flame-600 transition-all disabled:opacity-50 shadow-lg shadow-flame-500/20"
                >
                  {signingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Get Started Free'}
                  {!signingIn && <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />}
                </button>
                <button
                  onClick={handleGuestSignIn}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 
                    bg-iron-800/80 text-iron-200 border border-iron-700
                    rounded-xl font-medium hover:bg-iron-700/80 transition-all"
                >
                  <Play className="w-4 h-4" />
                  Try Demo
                </button>
              </div>
              <Link
                to="/docs"
                className="inline-flex items-center gap-1.5 text-sm text-iron-500 hover:text-iron-300 transition-colors mt-4"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Read the docs — how it works, calculations, AI system
              </Link>
              {signInError && (
                <p className="text-sm text-red-400 mt-3">
                  Sign-in failed: {signInError}
                </p>
              )}
            </motion.div>
          </div>
        </section>

        {/* Feature Showcase */}
        <section className="px-5 sm:px-8 pb-16">
          <div className="max-w-5xl mx-auto">
            {/* AI Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              className="mb-12"
            >
              <div className="grid lg:grid-cols-2 gap-6 items-start">
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-5 h-5 text-flame-400" />
                    <h2 className="font-display text-2xl text-iron-100">AI THAT KNOWS YOUR BODY</h2>
                  </div>
                  <p className="text-iron-400 mb-4 leading-relaxed">
                    The AI reviews your lift history, e1RM data, RPE trends, and pain flags to generate workouts tailored to you. 
                    It avoids exercises that cause you pain and progressively overloads based on real data.
                  </p>
                  <div className="space-y-2">
                    {[
                      'Analyzes your training history and maxes',
                      'Generates workouts with exercise-specific form cues',
                      'AI form check — frame-by-frame video analysis',
                      'Skips exercises flagged for pain',
                      'Bodyweight, hotel/travel, and 1RM test modes',
                    ].map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-iron-300">
                        <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
                <AIThinkingDemo />
              </div>
            </motion.div>

            {/* Today + Groups row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              className="mb-12"
            >
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-5 h-5 text-flame-400" />
                    <h3 className="font-display text-xl text-iron-100">YOUR DAY AT A GLANCE</h3>
                  </div>
                  <p className="text-sm text-iron-400 mb-4">
                    See today's workout, weekly progress, goal tracking, and community activity — all on one screen.
                  </p>
                  <TodayMockup />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-cyan-400" />
                    <h3 className="font-display text-xl text-iron-100">TRAIN TOGETHER</h3>
                  </div>
                  <p className="text-sm text-iron-400 mb-4">
                    Create groups, assign AI-generated workouts to your team, and track everyone's progress. Great for coaches and gym crews.
                  </p>
                  <GroupMockup />
                </div>
              </div>
            </motion.div>

            {/* Form Check */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              className="mb-12"
            >
              <div className="grid lg:grid-cols-2 gap-6 items-start">
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Video className="w-5 h-5 text-purple-400" />
                    <h2 className="font-display text-2xl text-iron-100">AI FORM CHECK</h2>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">BETA</span>
                  </div>
                  <p className="text-iron-400 mb-4 leading-relaxed">
                    Upload a video of your lift and get instant frame-by-frame form analysis from AI. 
                    It detects the exercise, scores each phase of the movement, and gives you specific coaching cues.
                  </p>
                  <div className="space-y-2">
                    {[
                      'Smart motion detection focuses on the actual lift',
                      'Per-frame scores with phase detection',
                      'Specific coaching cues and corrections',
                      'Video never leaves your device — only frames are sent',
                    ].map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-iron-300">
                        <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
                <FormCheckMockup />
              </div>
            </motion.div>

            {/* Feature chips */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              className="mb-16"
            >
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  { icon: Sparkles, label: 'AI Workouts' },
                  { icon: Video, label: 'AI Form Check (Beta)' },
                  { icon: Users, label: 'Group Training' },
                  { icon: Target, label: 'Goal Tracking' },
                  { icon: HelpCircle, label: 'Exercise Info' },
                  { icon: TrendingUp, label: '1RM Test Mode' },
                  { icon: Activity, label: 'Cardio Tracking' },
                  { icon: Calendar, label: 'Calendar' },
                  { icon: Dumbbell, label: '1RM Calculator' },
                  { icon: Brain, label: 'AI Coach Chat' },
                ].map(({ icon: Icon, label }, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-iron-800/60 border border-iron-700/40 rounded-full text-xs text-iron-300"
                  >
                    <Icon className="w-3 h-3 text-iron-500" />
                    {label}
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Bottom CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center pb-12"
            >
              <h2 className="font-display text-3xl sm:text-4xl text-iron-100 mb-3">
                START TRAINING TODAY
              </h2>
              <p className="text-iron-400 mb-6">
                Free to use. Earn credits by training and completing goals.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading || signingIn}
                  className="group flex items-center justify-center gap-2.5 px-6 py-3.5 bg-flame-500 text-white
                    rounded-xl font-semibold hover:bg-flame-600 transition-all disabled:opacity-50 shadow-lg shadow-flame-500/20"
                >
                  {signingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Get Started Free'}
                  {!signingIn && <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />}
                </button>
                <button
                  onClick={handleGuestSignIn}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 
                    bg-iron-800/80 text-iron-200 border border-iron-700
                    rounded-xl font-medium hover:bg-iron-700/80 transition-all"
                >
                  <Play className="w-4 h-4" />
                  Explore Demo
                </button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 px-5 sm:px-8 border-t border-iron-800/50">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-flame-500 flex items-center justify-center">
                <Dumbbell className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-display text-sm text-iron-500">BENCH ONLY</span>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/docs" className="text-xs text-iron-500 hover:text-iron-300 transition-colors flex items-center gap-1">
                <BookOpen className="w-3 h-3" /> Docs
              </Link>
              <a href="/ai-form-check" className="text-xs text-iron-500 hover:text-iron-300 transition-colors flex items-center gap-1">
                <Video className="w-3 h-3" /> AI Form Check
              </a>
              <a href="https://x.com/BenchPressOnly" target="_blank" rel="noopener noreferrer" className="text-xs text-iron-500 hover:text-iron-300 transition-colors flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                Follow
              </a>
              <a href="https://azoni.ai" target="_blank" rel="noopener noreferrer" className="text-xs text-iron-500 hover:text-iron-300 transition-colors">
                Built by Azoni
              </a>
              <p className="text-xs text-iron-600">
                © {new Date().getFullYear()}
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}