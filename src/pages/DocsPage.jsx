import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import {
  BookOpen,
  Calculator,
  Brain,
  AlertTriangle,
  Zap,
  Users,
  Target,
  Dumbbell,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Menu,
  X,
  Layers,
  Activity,
  Heart,
  ArrowLeft,
  LogIn,
  Video,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: BookOpen,
    group: 'Getting Started',
  },
  {
    id: 'workouts',
    label: 'Workouts',
    icon: Dumbbell,
    group: 'Features',
  },
  {
    id: 'programs',
    label: 'Programs',
    icon: Layers,
    group: 'Features',
  },
  {
    id: 'goals',
    label: 'Goals',
    icon: Target,
    group: 'Features',
  },
  {
    id: 'groups',
    label: 'Groups & Coaching',
    icon: Users,
    group: 'Features',
  },
  {
    id: 'formcheck',
    label: 'Form Check',
    icon: Video,
    group: 'Features',
  },
  {
    id: 'ai',
    label: 'AI System',
    icon: Brain,
    group: 'How It Works',
  },
  {
    id: 'calculations',
    label: 'Calculations',
    icon: Calculator,
    group: 'How It Works',
  },
  {
    id: 'pain',
    label: 'Pain Tracking',
    icon: AlertTriangle,
    group: 'How It Works',
  },
  {
    id: 'credits',
    label: 'Credits',
    icon: Zap,
    group: 'How It Works',
  },
  {
    id: 'about',
    label: 'About',
    icon: Heart,
    group: 'More',
  },
]

function SectionContent({ id }) {
  switch (id) {
    case 'overview':
      return (
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-iron-50 mb-3">BENCH ONLY</h1>
          <p className="text-iron-300 leading-relaxed mb-6">
            An AI-powered strength training companion that adapts to you. Log workouts, generate periodized programs,
            check your form, track pain, and train with friends — all driven by your real performance data.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {[
              { icon: Dumbbell, title: 'Smart Workouts', desc: 'AI generates workouts based on your maxes, RPE, and pain history. Control style, duration, and intensity.' },
              { icon: Layers, title: 'Periodized Programs', desc: 'Multi-week programs with auto-generated daily workouts.' },
              { icon: Target, title: 'Goal Tracking', desc: 'Set strength, rep, or hold targets. AI can suggest goals based on your data.' },
              { icon: Users, title: 'Group Training', desc: 'Train with friends, share workouts, and review each other\'s lifts.' },
              { icon: Brain, title: 'AI Coach', desc: 'Chat with an AI that knows your full training history.' },
              { icon: AlertTriangle, title: 'Pain Awareness', desc: 'Log pain on any set. The AI adapts around injuries automatically.' },
              { icon: Video, title: 'AI Form Check', desc: 'Upload a lift video for frame-by-frame analysis with scores and coaching cues.' },
              { icon: Activity, title: 'Cardio & Activity', desc: 'Log cardio sessions with calorie estimates. Set up recurring schedules.' },
              { icon: Calculator, title: '1RM Testing', desc: 'AI-generated max attempt sessions with warm-up ramps and attempt protocols.' },
            ].map(item => (
              <div key={item.title} className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
                <item.icon className="w-5 h-5 text-flame-400 mb-2" />
                <h3 className="text-sm font-semibold text-iron-100 mb-1">{item.title}</h3>
                <p className="text-xs text-iron-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Quick Start</h2>
          <ol className="space-y-3 text-iron-300 text-sm">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-flame-500/20 text-flame-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <span><strong className="text-iron-100">Sign in</strong> with Google. Your data syncs across devices.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-flame-500/20 text-flame-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <span><strong className="text-iron-100">Set a goal</strong> — pick a lift and a target weight, reps, or hold time.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-flame-500/20 text-flame-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <span><strong className="text-iron-100">Generate a program</strong> or individual workout. The AI uses your goals and history.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-flame-500/20 text-flame-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
              <span><strong className="text-iron-100">Log your sets</strong> — actual weight, reps, RPE, and pain level.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-flame-500/20 text-flame-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">5</span>
              <span><strong className="text-iron-100">Watch it adapt</strong> — every workout gets smarter as you train more.</span>
            </li>
          </ol>
        </div>
      )

    case 'workouts':
      return (
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-iron-50 mb-3">Workouts</h1>
          <p className="text-iron-300 leading-relaxed mb-6">
            Workouts are the core unit of training. You can create them manually, generate them with AI,
            or have them auto-generated from a program.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Creating Workouts</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-4">
            There are three ways to create a workout:
          </p>
          <div className="space-y-3 mb-8">
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-iron-100 mb-1">Manual</h3>
              <p className="text-xs text-iron-400 leading-relaxed">
                Add exercises, sets, weight, and reps yourself. Full control over every detail.
                Supports strength (weighted), bodyweight (reps), and time-based exercises.
              </p>
            </div>
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-iron-100 mb-1">AI Generated</h3>
              <p className="text-xs text-iron-400 leading-relaxed">
                Tell the AI what you want. Pick a style (Push, Pull, Legs, Upper, Full Body, Bench Focus, Bodyweight, Hotel/Travel),
                intensity, target duration, and exercise count. The AI builds a complete workout personalized to your data.
              </p>
            </div>
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-iron-100 mb-1">Program-Generated</h3>
              <p className="text-xs text-iron-400 leading-relaxed">
                When you're on a program, tap a scheduled day and the AI generates a workout 
                matching that day's prescription (e.g. "Heavy Bench 4×6 at 80%").
              </p>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">1RM Test Mode</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-6">
            Select "Test 1RM" as the workout style and pick an exercise. The AI generates a proper max-attempt
            session — progressive warm-up ramps from 40% to 90% of your estimated max, then 2–3 singles at
            95–105%. Includes rest guidance and light accessory cooldown work. If you have no training data for
            that lift, it starts from the bar and lets you work up by feel.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Cardio Tracking</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-6">
            Log cardio sessions with activity type, duration, and distance. The app estimates calories
            burned using MET values. You can also set up recurring schedules for regular cardio days.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Logging Sets</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-4">
            Each set captures:
          </p>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-iron-100 font-medium">Weight</span>
                <p className="text-xs text-iron-500">Prescribed vs. actual</p>
              </div>
              <div>
                <span className="text-iron-100 font-medium">Reps</span>
                <p className="text-xs text-iron-500">Prescribed vs. actual</p>
              </div>
              <div>
                <span className="text-iron-100 font-medium">RPE</span>
                <p className="text-xs text-iron-500">Rate of Perceived Exertion (1–10)</p>
              </div>
              <div>
                <span className="text-iron-100 font-medium">Pain Level</span>
                <p className="text-xs text-iron-500">0–10 scale, tracked per exercise</p>
              </div>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Workout Status</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-6">
            Workouts have three states: <strong className="text-iron-100">scheduled</strong> (generated but not started),
            <strong className="text-iron-100"> in-progress</strong> (you've started logging), and
            <strong className="text-iron-100"> completed</strong>. Only completed workouts feed into AI context
            and strength calculations. This prevents unfinished prescriptions from skewing your data.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Exercise Info</h2>
          <p className="text-iron-300 text-sm leading-relaxed">
            Each AI-generated exercise includes how-to instructions, key form cues, and substitution
            suggestions. Tap the exercise name (with the help icon) to view this info, or search YouTube
            for a video tutorial — all without leaving the app.
          </p>
        </div>
      )

    case 'programs':
      return (
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-iron-50 mb-3">Programs</h1>
          <p className="text-iron-300 leading-relaxed mb-6">
            Programs are multi-week periodized training plans. The AI designs the full structure — phases,
            weekly progression, deload weeks — and then generates individual workouts on-demand as you train.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Program Types</h2>
          <div className="space-y-3 mb-8">
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-flame-500" />
                <h3 className="text-sm font-semibold text-iron-100">Strength</h3>
              </div>
              <p className="text-xs text-iron-400 leading-relaxed">
                Barbell and dumbbell focused. Set a current max and target in pounds.
                AI programs percentage-based progression.
              </p>
            </div>
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-semibold text-iron-100">Bodyweight</h3>
              </div>
              <p className="text-xs text-iron-400 leading-relaxed">
                Calisthenics, holds, and progressions. Targets can be reps ("20 pull-ups") 
                or time ("5min plank"). AI uses descriptive intensity and progression schemes.
              </p>
            </div>
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <h3 className="text-sm font-semibold text-iron-100">Mixed</h3>
              </div>
              <p className="text-xs text-iron-400 leading-relaxed">
                Combines barbell work with bodyweight movements. Select from both exercise lists
                or type in your own.
              </p>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Configuration</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-4">
            When creating a program you set:
          </p>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4 space-y-2 text-sm mb-8">
            <div className="flex justify-between">
              <span className="text-iron-400">Focus exercises</span>
              <span className="text-iron-200">Select presets or type custom</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">Current / Target</span>
              <span className="text-iron-200">lbs for strength, text for bodyweight</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">Duration</span>
              <span className="text-iron-200">20, 30, 45, 60, or 90 min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">Length</span>
              <span className="text-iron-200">4–12 weeks</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">Training days</span>
              <span className="text-iron-200">Pick which days of the week</span>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">How Programs Work</h2>
          <p className="text-iron-300 text-sm leading-relaxed">
            The AI designs a full periodization plan (accumulation → intensification → peak/test) with at least 
            one deload week. It produces a week-by-week schedule with daily prescriptions — primary lift, 
            set/rep scheme, intensity, and accessories. When you tap a day to train, a separate AI call 
            generates the full workout with exact weights calculated from your current maxes. This two-step 
            approach means your weights stay current even if your max improves mid-program.
          </p>
        </div>
      )

    case 'goals':
      return (
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-iron-50 mb-3">Goals</h1>
          <p className="text-iron-300 leading-relaxed mb-6">
            Set targets for any exercise — not just barbell lifts. Track progress from your current level
            to where you want to be.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Goal Types</h2>
          <div className="space-y-3 mb-8">
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-iron-100 mb-1">Weight (1RM)</h3>
              <p className="text-xs text-iron-400 leading-relaxed">
                For maximal strength. E.g. "Bench Press: 295lb → 350lb by June."
                Progress tracked via estimated 1RM from your logged sets.
              </p>
            </div>
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-iron-100 mb-1">Reps</h3>
              <p className="text-xs text-iron-400 leading-relaxed">
                For rep-based targets. E.g. "Pull-ups: 8 → 20 reps."
                Tracked from your best set of that exercise.
              </p>
            </div>
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-iron-100 mb-1">Hold (Time)</h3>
              <p className="text-xs text-iron-400 leading-relaxed">
                For isometric holds. E.g. "Plank: 60s → 5min."
              </p>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">AI Goal Suggestions</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-6">
            Tap the "Suggest" button on the Goals page to have the AI analyze your training data and 
            propose 2–4 achievable goals. It looks at your current maxes, recent progress, and existing
            goals to avoid duplicates. If you don't have enough training data yet, it'll let you know — log
            a few workouts first and come back.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Custom Exercises</h2>
          <p className="text-iron-300 text-sm leading-relaxed">
            You can select from common presets or type in any exercise name. The AI understands
            virtually any exercise — "Cable Flies", "Turkish Get-up", "Dragon Flag", etc. Your custom 
            exercises carry through to program generation and workout creation.
          </p>
        </div>
      )

    case 'groups':
      return (
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-iron-50 mb-3">Groups & Coaching</h1>
          <p className="text-iron-300 leading-relaxed mb-6">
            Train with others. Groups let you share workouts, review each other's lifts, and stay accountable.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">How Groups Work</h2>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4 space-y-3 text-sm mb-8">
            <div>
              <span className="text-iron-100 font-medium">Create or join</span>
              <p className="text-xs text-iron-500">Anyone can create a group. Share the group code for others to join.</p>
            </div>
            <div>
              <span className="text-iron-100 font-medium">Shared workouts</span>
              <p className="text-xs text-iron-500">Generate group workouts that all members can do. Each person logs their own performance.</p>
            </div>
            <div>
              <span className="text-iron-100 font-medium">Workout reviews</span>
              <p className="text-xs text-iron-500">Submit completed workouts for coach/peer review. Reviewers see your actual vs. prescribed numbers.</p>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Activity Feed</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-6">
            The feed shows completed workouts, PRs, and milestones from people in your groups
            and your friends list. Comment and react to stay connected with your training partners.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Friends</h2>
          <p className="text-iron-300 text-sm leading-relaxed">
            Add friends by name to follow each other's progress. Friends' activity shows up in your feed
            even if you're not in the same group. Go to the Friends page to search and send requests.
          </p>
        </div>
      )

    case 'formcheck':
      return (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-2xl lg:text-3xl font-display text-iron-50">AI Form Check</h1>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">BETA</span>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-6">
            <p className="text-sm text-amber-300/80 leading-relaxed">
              AI Form Check is currently in beta. Results may vary depending on video quality, lighting, and camera angle. We're actively improving accuracy.
            </p>
          </div>
          <p className="text-iron-300 leading-relaxed mb-6">
            Upload a video of your lift and get instant AI-powered form analysis. The system extracts
            key frames, identifies the exercise, and scores each phase of the movement.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">How It Works</h2>
          <ol className="space-y-3 text-iron-300 text-sm mb-8">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <span><strong className="text-iron-100">Record or upload</strong> a video of your lift (or use your camera directly).</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <span><strong className="text-iron-100">Smart frame extraction</strong> detects motion and pulls the most relevant frames from the actual lift.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <span><strong className="text-iron-100">AI analyzes</strong> each frame — identifying the exercise, scoring form phases, and detecting issues.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
              <span><strong className="text-iron-100">Get results</strong> with an overall score, per-frame breakdown, coaching cues, and injury risk flags.</span>
            </li>
          </ol>

          <h2 className="text-lg font-display text-iron-100 mb-3">What You Get</h2>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4 space-y-3 text-sm mb-8">
            <div>
              <span className="text-iron-100 font-medium">Overall Score</span>
              <p className="text-xs text-iron-500">1–10 rating of your form across the entire lift.</p>
            </div>
            <div>
              <span className="text-iron-100 font-medium">Phase Detection</span>
              <p className="text-xs text-iron-500">Each frame is labeled (setup, descent, bottom, ascent, lockout) with its own score.</p>
            </div>
            <div>
              <span className="text-iron-100 font-medium">Coaching Cues</span>
              <p className="text-xs text-iron-500">Specific, actionable cues for each frame — written as if a coach is talking directly to you.</p>
            </div>
            <div>
              <span className="text-iron-100 font-medium">Injury Risks</span>
              <p className="text-xs text-iron-500">Flags body areas at risk with severity levels and specific fixes.</p>
            </div>
            <div>
              <span className="text-iron-100 font-medium">Focus Drill</span>
              <p className="text-xs text-iron-500">The single most important thing to fix next session, with a memorable cue.</p>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Quality Tiers</h2>
          <div className="space-y-3 mb-8">
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-iron-100">Quick</h3>
                <span className="text-xs text-iron-500">10 credits</span>
              </div>
              <p className="text-xs text-iron-400">6 frames — fast overview of your form. Good for a quick check.</p>
            </div>
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-iron-100">Standard</h3>
                <span className="text-xs text-iron-500">15 credits</span>
              </div>
              <p className="text-xs text-iron-400">10 frames — detailed analysis with phase-by-phase breakdown.</p>
            </div>
            <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-iron-100">Detailed</h3>
                <span className="text-xs text-iron-500">25 credits</span>
              </div>
              <p className="text-xs text-iron-400">16 frames — comprehensive analysis catching subtle issues across the full movement.</p>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Privacy</h2>
          <p className="text-iron-300 text-sm leading-relaxed">
            Your video never leaves your device. Only the extracted frames are sent for analysis, and
            frame data is automatically deleted from the server after processing completes.
          </p>
        </div>
      )

    case 'ai':
      return (
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-iron-50 mb-3">AI System</h1>
          <p className="text-iron-300 leading-relaxed mb-6">
            Every AI feature reads your real training data before generating anything. The more you
            log, the smarter it gets.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">What the AI Knows</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-4">
            Before each generation, the app scans your completed workouts and builds a context snapshot:
          </p>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4 space-y-3 text-sm mb-8">
            <div>
              <span className="text-iron-100 font-medium">Max lifts (e1RM)</span>
              <p className="text-xs text-iron-500">Your estimated 1-rep max for every exercise you've logged, calculated from your best set.</p>
            </div>
            <div>
              <span className="text-iron-100 font-medium">Pain history</span>
              <p className="text-xs text-iron-500">Which exercises have caused pain, how severe, and how recently. See Pain Tracking for decay logic.</p>
            </div>
            <div>
              <span className="text-iron-100 font-medium">RPE patterns</span>
              <p className="text-xs text-iron-500">Your average RPE per exercise. If you consistently rate something high, the AI scales back.</p>
            </div>
            <div>
              <span className="text-iron-100 font-medium">Recent workouts</span>
              <p className="text-xs text-iron-500">What you've done lately — to avoid repeating the same session and balance volume.</p>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Data Quality Guards</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-6">
            Only <strong className="text-iron-100">completed</strong> workouts feed into AI context. If a workout was 
            generated but you didn't actually do it, the prescribed numbers are excluded. This prevents the AI from 
            training on its own guesses. Within completed workouts, sets must have actual performance data 
            (not just the prescribed values) to be counted.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">New User Handling</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-6">
            If you have no training history yet, the AI sets weights conservatively — bar weight to 65 lbs for
            upper body, 95–135 lbs for lower body. A note will remind you to log the session so future workouts
            can be personalized. The more you train, the smarter it gets.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Warm-Up Guidance</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-6">
            For the first compound lift in each workout, the AI includes warm-up ramp sets in the
            exercise notes — scaled to your working weight. For example: "Warm-up: Bar×10, 95×8, 135×5,
            185×3 → working sets." Isolation and accessory exercises skip warm-ups.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">AI Chat</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-4">
            The floating chat button opens a conversation with an AI coach that has full access to your 
            training context. Ask it anything — "What should I focus on this week?", "Why is my bench 
            stalling?", "Design a peaking protocol for my meet."
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Models</h2>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4 space-y-3 text-sm">
            <div>
              <span className="text-iron-100 font-medium">Standard</span>
              <p className="text-xs text-iron-500">Fast, cost-efficient model. Great for most workouts and programs.</p>
            </div>
            <div>
              <span className="text-iron-100 font-medium">Premium</span>
              <p className="text-xs text-iron-500">More capable model for complex programs and nuanced coaching. Currently in beta.</p>
            </div>
          </div>
        </div>
      )

    case 'calculations':
      return (
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-iron-50 mb-3">Calculations</h1>
          <p className="text-iron-300 leading-relaxed mb-6">
            Understanding how the app calculates your strength numbers.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Estimated 1-Rep Max (e1RM)</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-4">
            The app uses the Epley formula to estimate your one-rep max from any set:
          </p>
          <div className="bg-iron-950 border border-iron-800 rounded-xl p-5 mb-4 font-mono text-center">
            <span className="text-flame-400 text-lg">e1RM = weight × (1 + reps ÷ 30)</span>
          </div>
          <p className="text-iron-400 text-sm leading-relaxed mb-6">
            For example, benching 225lb for 8 reps gives an e1RM of 225 × (1 + 8/30) = <strong className="text-iron-200">285lb</strong>.
            This is used across the app — goal tracking, AI context, workout generation percentages.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Why Epley?</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-6">
            It's simple, well-validated for rep ranges of 1–10, and easy to compute per-set without
            needing complex lookup tables. For very high rep sets (12+), the formula becomes less 
            accurate — the app caps tracking at 12 reps for e1RM calculations.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Working Weight Percentages</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-4">
            When the AI generates workouts, it prescribes weights as percentages of your e1RM.
            Common ranges:
          </p>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex justify-between"><span className="text-iron-400">Warm-up</span><span className="text-iron-200">40–60%</span></div>
              <div className="flex justify-between"><span className="text-iron-400">Volume</span><span className="text-iron-200">65–75%</span></div>
              <div className="flex justify-between"><span className="text-iron-400">Strength</span><span className="text-iron-200">75–85%</span></div>
              <div className="flex justify-between"><span className="text-iron-400">Heavy</span><span className="text-iron-200">85–95%</span></div>
              <div className="flex justify-between"><span className="text-iron-400">Max test</span><span className="text-iron-200">95–100%+</span></div>
              <div className="flex justify-between"><span className="text-iron-400">Deload</span><span className="text-iron-200">50–65%</span></div>
            </div>
          </div>
        </div>
      )

    case 'pain':
      return (
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-iron-50 mb-3">Pain Tracking</h1>
          <p className="text-iron-300 leading-relaxed mb-6">
            The pain system is designed to protect you from re-injury while not permanently banning exercises.
            It tracks recency and severity so the AI can make smart decisions.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">How It Works</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-4">
            On every set, you can log a pain level from 0–10. The app tracks per exercise:
          </p>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4 space-y-2 text-sm mb-8">
            <div className="flex justify-between">
              <span className="text-iron-400">Peak pain</span>
              <span className="text-iron-200">Highest level ever reported</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">Total reports</span>
              <span className="text-iron-200">How many times pain was logged</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">Last reported</span>
              <span className="text-iron-200">How many days ago</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">Recent count</span>
              <span className="text-iron-200">Reports in the last 30 days</span>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Three-Tier Decay</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-4">
            Pain classification decays over time. The AI responds differently at each tier:
          </p>
          <div className="space-y-3 mb-8">
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <h3 className="text-sm font-semibold text-red-300">Active</h3>
                <span className="text-xs text-iron-500 ml-auto">pain in last 30 days</span>
              </div>
              <p className="text-xs text-iron-400 leading-relaxed">
                AI avoids the exercise entirely. Substitutes a similar movement pattern that 
                doesn't aggravate the issue.
              </p>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <h3 className="text-sm font-semibold text-amber-300">Fading</h3>
                <span className="text-xs text-iron-500 ml-auto">31–60 days, none recent</span>
              </div>
              <p className="text-xs text-iron-400 leading-relaxed">
                AI may include the exercise at reduced intensity and volume. 
                Adds a coaching note: "Stop if any discomfort."
              </p>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-semibold text-emerald-300">Recovering</h3>
                <span className="text-xs text-iron-500 ml-auto">60+ days, none recent</span>
              </div>
              <p className="text-xs text-iron-400 leading-relaxed">
                AI programs the exercise normally but includes a note about the history. 
                You've likely moved past the issue, but it stays on the radar.
              </p>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Significance Thresholds</h2>
          <p className="text-iron-300 text-sm leading-relaxed">
            The AI only flags exercises where pain reached 3/10 or higher, or was reported 2+ times.
            A single 1/10 log won't restrict anything — it needs a meaningful pattern to act on.
          </p>
        </div>
      )

    case 'credits':
      return (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-2xl lg:text-3xl font-display text-iron-50">Credits</h1>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">BETA</span>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-6">
            <p className="text-sm text-amber-300/80 leading-relaxed">
              The credit system is in beta. Pricing and earning rates may change as we continue development.
            </p>
          </div>
          <p className="text-iron-300 leading-relaxed mb-6">
            Credits power AI features. You start with 50 and earn more by completing onboarding tasks and training consistently.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Earning Credits</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-4">
            When you first sign up, a checklist appears on the Today page with tasks that earn bonus credits:
          </p>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-iron-800">
                  <th className="text-left px-4 py-3 text-iron-400 font-medium">Task</th>
                  <th className="text-right px-4 py-3 text-iron-400 font-medium">Reward</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-iron-800/50">
                <tr>
                  <td className="px-4 py-3 text-iron-200">Read the docs</td>
                  <td className="px-4 py-3 text-right text-green-400 font-mono">+25</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-iron-200">Set your first goal</td>
                  <td className="px-4 py-3 text-right text-green-400 font-mono">+100</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-iron-200">Complete a workout</td>
                  <td className="px-4 py-3 text-right text-green-400 font-mono">+100</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-iron-200">Generate an AI workout</td>
                  <td className="px-4 py-3 text-right text-green-400 font-mono">+50</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-iron-200">Add a friend</td>
                  <td className="px-4 py-3 text-right text-green-400 font-mono">+50</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Credit Costs</h2>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-iron-800">
                  <th className="text-left px-4 py-3 text-iron-400 font-medium">Action</th>
                  <th className="text-right px-4 py-3 text-iron-400 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-iron-800/50">
                <tr>
                  <td className="px-4 py-3 text-iron-200">Generate a workout</td>
                  <td className="px-4 py-3 text-right text-flame-400 font-mono">5 credits</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-iron-200">Generate a program</td>
                  <td className="px-4 py-3 text-right text-flame-400 font-mono">10 credits</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-iron-200">AI chat message</td>
                  <td className="px-4 py-3 text-right text-flame-400 font-mono">1 credit</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-iron-200">Group workout (per athlete)</td>
                  <td className="px-4 py-3 text-right text-flame-400 font-mono">5 credits</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Refunds</h2>
          <p className="text-iron-300 text-sm leading-relaxed mb-6">
            If a generation fails (network error, AI returns invalid format, etc.), your credits are
            automatically refunded. You only pay for successful generations.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">Viewing Your Balance</h2>
          <p className="text-iron-300 text-sm leading-relaxed">
            Your credit balance is shown in the header bar (mobile) and sidebar (desktop). 
            Tap it to go to Settings where you can see your full usage history.
          </p>
        </div>
      )

    case 'about':
      return (
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-iron-50 mb-3">About</h1>
          <p className="text-iron-300 leading-relaxed mb-8">
            BENCH ONLY is built by a solo developer who lifts. The goal is simple —
            make AI-powered coaching accessible to everyone, not just people who can afford a personal trainer.
          </p>

          <h2 className="text-lg font-display text-iron-100 mb-3">The Developer</h2>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-5 mb-8">
            <p className="text-iron-300 text-sm leading-relaxed mb-4">
              Built by <strong className="text-iron-100">Azoni</strong> — a software engineer focused on 
              AI-powered applications, developer tools, and products that solve real problems.
            </p>
            <a
              href="https://azoni.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-flame-500/10 hover:bg-flame-500/20 
                text-flame-400 rounded-lg text-sm font-medium transition-colors"
            >
              azoni.ai <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Tech Stack</h2>
          <div className="bg-iron-900/50 border border-iron-800 rounded-xl p-4 text-sm space-y-2 mb-8">
            <div className="flex justify-between">
              <span className="text-iron-400">Frontend</span>
              <span className="text-iron-200">React + Vite + Tailwind</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">Backend</span>
              <span className="text-iron-200">Netlify Functions</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">Database</span>
              <span className="text-iron-200">Firebase / Firestore</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">AI</span>
              <span className="text-iron-200">OpenAI GPT-4.1-mini / GPT-4o-mini</span>
            </div>
            <div className="flex justify-between">
              <span className="text-iron-400">PWA</span>
              <span className="text-iron-200">Installable on any device</span>
            </div>
          </div>

          <h2 className="text-lg font-display text-iron-100 mb-3">Feedback</h2>
          <p className="text-iron-300 text-sm leading-relaxed">
            Feature requests, bug reports, or just want to say hi — reach out through the 
            portfolio site or use the AI chat to let us know what you think.
          </p>
        </div>
      )

    default:
      return null
  }
}

export default function DocsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeSection, setActiveSection] = useState('overview')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const contentRef = useRef(null)

  // Read section from hash
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (hash && SECTIONS.find(s => s.id === hash)) {
      setActiveSection(hash)
    }
  }, [location.hash])

  const goToSection = (id) => {
    setActiveSection(id)
    navigate(`/docs#${id}`, { replace: true })
    setMobileSidebarOpen(false)
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
    // Also scroll window on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const currentIndex = SECTIONS.findIndex(s => s.id === activeSection)
  const prevSection = currentIndex > 0 ? SECTIONS[currentIndex - 1] : null
  const nextSection = currentIndex < SECTIONS.length - 1 ? SECTIONS[currentIndex + 1] : null

  // Group sections for sidebar
  const groups = []
  SECTIONS.forEach(s => {
    const existing = groups.find(g => g.name === s.group)
    if (existing) {
      existing.items.push(s)
    } else {
      groups.push({ name: s.group, items: [s] })
    }
  })

  const Sidebar = ({ className = '' }) => (
    <nav className={className}>
      {groups.map(group => (
        <div key={group.name} className="mb-5">
          <h3 className="text-[11px] font-semibold text-iron-500 uppercase tracking-wider px-3 mb-1.5">
            {group.name}
          </h3>
          <div className="space-y-0.5">
            {group.items.map(section => {
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  onClick={() => goToSection(section.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left
                    ${isActive
                      ? 'bg-flame-500/10 text-flame-400 font-medium'
                      : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800/50'
                    }`}
                >
                  <section.icon className="w-4 h-4 flex-shrink-0" />
                  {section.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-iron-950">
      {/* Top header bar */}
      <header className="sticky top-0 z-30 bg-iron-900/95 backdrop-blur-sm border-b border-iron-800">
        <div className="max-w-6xl mx-auto h-14 flex items-center justify-between px-4">
          <Link to={user ? '/today' : '/login'} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-flame-500 flex items-center justify-center">
              <Dumbbell className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-display text-lg text-iron-50 tracking-wide hidden sm:block">BENCH ONLY</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-iron-400">
              <BookOpen className="w-4 h-4 text-flame-400" />
              <span className="hidden sm:inline">Documentation</span>
            </div>
            {user ? (
              <Link
                to="/today"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-iron-300 hover:text-iron-100 
                  bg-iron-800 hover:bg-iron-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to app
              </Link>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white
                  bg-flame-500 hover:bg-flame-600 rounded-lg transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto">
        {/* Mobile doc breadcrumb */}
        <div className="lg:hidden sticky top-14 z-20 bg-iron-950/95 backdrop-blur-sm border-b border-iron-800 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="p-1.5 rounded-lg bg-iron-800/50 text-iron-300"
          >
            {mobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-iron-500">Docs</span>
            <ChevronRight className="w-3 h-3 text-iron-600" />
            <span className="text-iron-100 font-medium">{SECTIONS.find(s => s.id === activeSection)?.label}</span>
          </div>
        </div>

        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-10"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="lg:hidden fixed left-0 top-0 bottom-0 w-64 bg-iron-900 z-20 border-r border-iron-800 overflow-y-auto pt-28 pb-8 px-2">
              <Sidebar />
            </div>
          </>
        )}

        <div className="flex min-h-[calc(100vh-3.5rem)]">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-56 flex-shrink-0 border-r border-iron-800">
            <div className="sticky top-14 py-6 px-2 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
              <Sidebar />
            </div>
          </aside>

          {/* Content area */}
          <div ref={contentRef} className="flex-1 min-w-0">
            <div className="max-w-3xl mx-auto px-4 lg:px-10 py-6 lg:py-10">
              <SectionContent id={activeSection} />

              {/* Bottom navigation */}
              <div className="mt-12 pt-6 border-t border-iron-800 flex items-stretch gap-3">
                {prevSection ? (
                  <button
                    onClick={() => goToSection(prevSection.id)}
                    className="flex-1 flex items-center gap-3 p-4 rounded-xl bg-iron-900/50 border border-iron-800 
                      hover:bg-iron-800/50 hover:border-iron-700 transition-colors text-left group"
                  >
                    <ChevronLeft className="w-4 h-4 text-iron-500 group-hover:text-iron-300 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[11px] text-iron-500 uppercase tracking-wider">Previous</span>
                      <p className="text-sm text-iron-200 font-medium truncate">{prevSection.label}</p>
                    </div>
                  </button>
                ) : <div className="flex-1" />}
                
                {nextSection ? (
                  <button
                    onClick={() => goToSection(nextSection.id)}
                    className="flex-1 flex items-center justify-end gap-3 p-4 rounded-xl bg-iron-900/50 border border-iron-800 
                      hover:bg-iron-800/50 hover:border-iron-700 transition-colors text-right group"
                  >
                    <div className="min-w-0">
                      <span className="text-[11px] text-iron-500 uppercase tracking-wider">Next</span>
                      <p className="text-sm text-iron-200 font-medium truncate">{nextSection.label}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-iron-500 group-hover:text-iron-300 flex-shrink-0" />
                  </button>
                ) : <div className="flex-1" />}
              </div>

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-iron-800/50 flex flex-col sm:flex-row items-center justify-between gap-3 pb-8">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-flame-500 flex items-center justify-center">
                    <Dumbbell className="w-3 h-3 text-white" />
                  </div>
                  <span className="font-display text-xs text-iron-500">BENCH ONLY</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-iron-600">
                  <a href="https://x.com/BenchPressOnly" target="_blank" rel="noopener noreferrer" className="hover:text-iron-400 transition-colors flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    Follow
                  </a>
                  <a href="https://azoni.ai" target="_blank" rel="noopener noreferrer" className="hover:text-iron-400 transition-colors">
                    Built by Azoni
                  </a>
                  <span>© {new Date().getFullYear()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}