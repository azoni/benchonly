import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users,
  Dumbbell,
  Brain,
  TrendingUp,
  Sparkles,
  Target,
  ChevronRight,
  BarChart2,
  Calendar,
  Zap,
  CheckCircle,
  ArrowRight,
  MessageCircle,
} from 'lucide-react'

const FEATURES = [
  {
    icon: Sparkles,
    color: 'flame',
    title: 'AI Workouts for Every Athlete',
    body: 'Generate personalized workouts for your entire group in one click. The AI reads each athlete\'s history, strength levels, and recovery — no cookie-cutter programming.',
  },
  {
    icon: BarChart2,
    color: 'cyan',
    title: 'Track Every Client\'s Progress',
    body: 'See all your athletes\' completed workouts, PRs, and trends in a single group dashboard. Spot who\'s crushing it and who needs attention — instantly.',
  },
  {
    icon: Brain,
    color: 'purple',
    title: 'AI Coach That Knows the Data',
    body: 'Ask the AI anything about your athletes. "Who hasn\'t trained in 5 days?" "What\'s Jordan\'s bench trend?" Get real answers from real data.',
  },
  {
    icon: Calendar,
    color: 'blue',
    title: 'Group Scheduling',
    body: 'Push the same session to your whole group at once, or tailor loads per athlete. Everyone sees their workout the moment you publish it.',
  },
  {
    icon: TrendingUp,
    color: 'green',
    title: 'Strength Progression Built In',
    body: 'Every set is logged, e1RMs are tracked automatically. Watch your clients hit new PRs and celebrate the milestones that keep them coming back.',
  },
  {
    icon: MessageCircle,
    color: 'amber',
    title: 'Keep Your Athletes Engaged',
    body: 'Group feed, goal completions, and personal records create a community around your coaching — not just a spreadsheet.',
  },
]

const STEPS = [
  { step: '01', title: 'Create a Group', body: 'Name your group, set a focus (powerlifting, general strength, etc.), and invite athletes via a link.' },
  { step: '02', title: 'Generate a Session', body: 'Tap Generate. The AI builds workouts tailored to each athlete\'s current level and recent training.' },
  { step: '03', title: 'Publish & Track', body: 'Athletes complete their workouts. You see every rep, every set, every PR — live.' },
]

const TESTIMONIALS = [
  {
    quote: 'I used to spend Sunday nights programming for 10 clients. Now I hit generate and it\'s done in 30 seconds.',
    name: 'Coach Mike',
    detail: 'Powerlifting coach, 12 athletes',
  },
  {
    quote: 'My clients love seeing each other\'s PRs in the feed. It\'s become a competition — in the best way.',
    name: 'Sarah T.',
    detail: 'Online strength coach',
  },
  {
    quote: 'The AI actually understands periodization. It\'s not just random exercises — it remembers what they did last week.',
    name: 'Dan R.',
    detail: 'S&C coach, university team',
  },
]

export default function CoachesPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')

  function handleCTA() {
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-iron-950 text-iron-100 overflow-x-hidden">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-iron-800/60 bg-iron-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-flame-500/10 border border-flame-500/30 flex items-center justify-center">
              <Dumbbell className="w-4 h-4 text-flame-400" />
            </div>
            <span className="font-display text-lg tracking-wider text-iron-100">BENCH ONLY</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/docs" className="text-sm text-iron-400 hover:text-iron-100 transition-colors hidden sm:block">
              Docs
            </Link>
            <button
              onClick={handleCTA}
              className="btn-primary text-sm px-4 py-2"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 relative">
        {/* Glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-flame-500/6 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 bg-flame-500/10 border border-flame-500/25 rounded-full px-4 py-1.5 mb-6">
              <Users className="w-3.5 h-3.5 text-flame-400" />
              <span className="text-xs font-semibold text-flame-300 tracking-wider uppercase">Built for Coaches</span>
            </div>

            <h1 className="font-display text-5xl sm:text-7xl tracking-wider text-iron-50 leading-none mb-6">
              STOP PROGRAMMING.<br />
              <span className="text-gradient">START COACHING.</span>
            </h1>

            <p className="text-iron-300 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-10">
              Bench Only gives coaches AI-powered workout generation, live athlete tracking, and a group training hub — so you spend less time building spreadsheets and more time coaching.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={handleCTA}
                className="btn-primary flex items-center gap-2 text-base px-8 py-3 w-full sm:w-auto justify-center"
              >
                Create Your Coach Account
                <ArrowRight className="w-4 h-4" />
              </button>
              <Link
                to="/login?preview=true"
                className="btn-secondary flex items-center gap-2 text-base px-8 py-3 w-full sm:w-auto justify-center"
              >
                See it in action
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <p className="text-iron-500 text-sm mt-4">Free to start. No credit card required.</p>
          </motion.div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-iron-800/60 bg-iron-900/40 py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { value: '30s', label: 'To generate a full group session' },
            { value: '100%', label: 'Personalized per athlete' },
            { value: '0', label: 'Spreadsheets needed' },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="font-display text-4xl sm:text-5xl text-flame-400 tracking-wider">{value}</p>
              <p className="text-iron-400 text-xs sm:text-sm mt-1 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl sm:text-5xl tracking-wider text-iron-50 mb-3">
              EVERYTHING YOU NEED
            </h2>
            <p className="text-iron-400 max-w-xl mx-auto">Built specifically for strength coaches who train groups — not another generic fitness app.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, color, title, body }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="card-steel rounded-2xl p-6"
              >
                <div className={`w-10 h-10 rounded-xl bg-${color}-500/10 border border-${color}-500/20 flex items-center justify-center mb-4`}>
                  <Icon className={`w-5 h-5 text-${color}-400`} />
                </div>
                <h3 className="font-semibold text-iron-100 mb-2">{title}</h3>
                <p className="text-sm text-iron-400 leading-relaxed">{body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 bg-iron-900/30 border-y border-iron-800/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl sm:text-5xl tracking-wider text-iron-50 mb-3">
              HOW IT WORKS
            </h2>
            <p className="text-iron-400">Up and running in minutes. No setup headaches.</p>
          </div>

          <div className="space-y-6">
            {STEPS.map(({ step, title, body }, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-6 items-start"
              >
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-flame-500/10 border border-flame-500/25 flex items-center justify-center">
                  <span className="font-display text-xl text-flame-400 tracking-wider">{step}</span>
                </div>
                <div className="pt-2">
                  <h3 className="font-semibold text-iron-100 text-lg mb-1">{title}</h3>
                  <p className="text-iron-400 leading-relaxed">{body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl sm:text-5xl tracking-wider text-iron-50 mb-3">
              COACHES LOVE IT
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TESTIMONIALS.map(({ quote, name, detail }) => (
              <div key={name} className="card-steel rounded-2xl p-6 flex flex-col gap-4">
                <p className="text-iron-300 text-sm leading-relaxed italic">"{quote}"</p>
                <div className="mt-auto">
                  <p className="font-semibold text-iron-100 text-sm">{name}</p>
                  <p className="text-iron-500 text-xs">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Group workout feature callout */}
      <section className="py-20 px-4 sm:px-6 bg-iron-900/30 border-y border-iron-800/40">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl bg-gradient-to-br from-flame-500/8 via-iron-900/60 to-purple-500/8 border border-flame-500/20 p-8 sm:p-12">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-flame-500/15 border border-flame-500/30 flex items-center justify-center flex-shrink-0">
                <Zap className="w-6 h-6 text-flame-400" />
              </div>
              <div>
                <h2 className="font-display text-3xl sm:text-4xl tracking-wider text-iron-50 leading-tight">
                  ONE CLICK.<br />EVERY ATHLETE GETS THEIR WORKOUT.
                </h2>
              </div>
            </div>

            <p className="text-iron-300 leading-relaxed mb-8 max-w-2xl">
              Generate workouts for your entire roster simultaneously. The AI accounts for each person's training history, current strength levels, and recent load — then produces individualized sessions. You review, adjust if needed, and publish. Done.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {[
                'Individualized loads per athlete',
                'Based on actual training history',
                'Accounts for injuries & fatigue',
                'Review before publishing',
                'Athletes notified instantly',
                'All logs visible to you in real time',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-flame-400 flex-shrink-0" />
                  <span className="text-sm text-iron-300">{item}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleCTA}
              className="btn-primary flex items-center gap-2 text-base px-8 py-3"
            >
              Try It Free
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 sm:px-6 text-center relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-flame-500/5 rounded-full blur-3xl" />
        </div>
        <div className="max-w-2xl mx-auto relative">
          <Target className="w-10 h-10 text-flame-500/60 mx-auto mb-6" />
          <h2 className="font-display text-5xl sm:text-6xl tracking-wider text-iron-50 mb-4">
            READY TO LEVEL UP<br />YOUR COACHING?
          </h2>
          <p className="text-iron-400 mb-8 text-lg">
            Join coaches who've replaced their programming spreadsheets with AI that actually knows their athletes.
          </p>
          <button
            onClick={handleCTA}
            className="btn-primary flex items-center gap-2 text-base px-10 py-4 mx-auto"
          >
            Create Your Free Account
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-iron-600 text-sm mt-4">No credit card. Free to start.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-iron-800/60 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-flame-400" />
            <span className="font-display tracking-wider text-iron-400">BENCH ONLY</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-iron-500">
            <Link to="/docs" className="hover:text-iron-300 transition-colors">Docs</Link>
            <Link to="/privacy" className="hover:text-iron-300 transition-colors">Privacy</Link>
            <Link to="/login" className="hover:text-iron-300 transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
