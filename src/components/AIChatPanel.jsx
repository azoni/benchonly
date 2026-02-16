import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, Sparkles, Bot, User, Plus, Dumbbell } from 'lucide-react';
import { useUIStore } from '../store';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { workoutService, goalService, healthService, userService, scheduleService, recurringActivityService, creditService, CREDIT_COSTS } from '../services/firestore';
import { collection, query, where, limit, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ouraService } from '../services/ouraService';

export default function AIChatPanel() {
  const navigate = useNavigate();
  const { chatOpen, setChatOpen } = useUIStore();
  const { user, userProfile, updateProfile, isAppAdmin } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(null);
  const [context, setContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [greetingLoading, setGreetingLoading] = useState(false);
  const [quickActions, setQuickActions] = useState([]);
  const [greetingFetched, setGreetingFetched] = useState(false);
  const lastPersonalityRef = useRef(null);
  const [aiSettings, setAiSettings] = useState(null);
  const [rateLimitInfo, setRateLimitInfo] = useState(() => {
    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * 60 * 60 * 1000;
    try {
      const stored = localStorage.getItem('ai_rate_limit');
      const dailyStored = localStorage.getItem('ai_daily_limit');
      let rateData = stored ? JSON.parse(stored) : { count: 0, resetTime: now + HOUR };
      let dailyData = dailyStored ? JSON.parse(dailyStored) : { count: 0, resetTime: now + DAY };
      if (now > rateData.resetTime) rateData = { count: 0, resetTime: now + HOUR };
      if (now > dailyData.resetTime) dailyData = { count: 0, resetTime: now + DAY };
      return { ...rateData, dailyCount: dailyData.count, dailyResetTime: dailyData.resetTime };
    } catch { return { count: 0, resetTime: null }; }
  });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const RATE_LIMIT_WINDOW = 60 * 60 * 1000;
  const DAILY_WINDOW = 24 * 60 * 60 * 1000;
  // Dynamic limits from admin settings, with defaults
  const RATE_LIMIT = aiSettings?.rateLimitHourly || 8;
  const DAILY_LIMIT = aiSettings?.rateLimitDaily || 25;
  const OVERAGE_MULTIPLIER = aiSettings?.overageCreditMultiplier || 3;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (chatOpen) {
      inputRef.current?.focus();
      if (!context && !contextLoading) {
        loadUserContext();
      }
      if (!aiSettings) {
        loadAiSettings();
      }
    }
  }, [chatOpen]);

  // Load admin-configured rate limit settings
  const loadAiSettings = async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'ai'));
      if (snap.exists()) {
        setAiSettings(snap.data());
      }
    } catch { /* defaults will be used */ }
  };

  // Fetch greeting once context is ready
  useEffect(() => {
    if (context && !greetingFetched && chatOpen) {
      fetchGreeting();
    }
  }, [context, greetingFetched, chatOpen]);

  // Reset greeting if personality changes
  useEffect(() => {
    const currentPersonality = userProfile?.chatPersonality || 'coach';
    if (lastPersonalityRef.current && lastPersonalityRef.current !== currentPersonality && greetingFetched) {
      setGreetingFetched(false);
      setMessages([]);
      setQuickActions([]);
    }
    lastPersonalityRef.current = currentPersonality;
  }, [userProfile?.chatPersonality]);

  const loadUserContext = async () => {
    if (!user) return;
    setContextLoading(true);
    try {
      const [goals, healthEntries, schedules, recurring] = await Promise.all([
        goalService.getByUser(user.uid).catch(() => []),
        healthService.getByUser(user.uid, 14).catch(() => []),
        scheduleService.getByUser(user.uid).catch(() => []),
        recurringActivityService.getByUser(user.uid).catch(() => []),
      ]);

      // Load ALL workouts (strength + cardio) — ONLY completed
      let allWorkouts = [];
      try {
        const snap = await getDocs(query(
          collection(db, 'workouts'), where('userId', '==', user.uid), limit(50)
        ));
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.status !== 'completed') return;
          const workoutDate = d.date?.toDate?.() || new Date(d.date);
          allWorkouts.push({ ...d, date: workoutDate.toISOString().split('T')[0] });
        });
      } catch (e) { console.error(e); }

      // Load group workouts — ONLY completed
      try {
        const snap = await getDocs(query(
          collection(db, 'groupWorkouts'), where('assignedTo', '==', user.uid), limit(30)
        ));
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.status !== 'completed') return;
          const workoutDate = d.date?.toDate?.() || new Date(d.date);
          allWorkouts.push({ ...d, date: workoutDate.toISOString().split('T')[0], isGroup: true });
        });
      } catch (e) { console.error(e); }

      allWorkouts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      const cardioWorkouts = allWorkouts.filter(w => w.workoutType === 'cardio').slice(0, 10);
      const strengthWorkouts = allWorkouts.filter(w => w.workoutType !== 'cardio');

      // Build max lifts, pain history, RPE data
      const maxLifts = {};
      const painHistory = {};
      const rpeData = {};
      const now = new Date();

      strengthWorkouts.slice(0, 25).forEach(w => {
        const workoutDate = w.date?.toDate ? w.date.toDate() : w.date ? new Date(w.date) : null;
        const daysSince = workoutDate && !isNaN(workoutDate.getTime()) ? Math.floor((now - workoutDate) / (1000 * 60 * 60 * 24)) : null;
        (w.exercises || []).forEach(ex => {
          if (!ex.name) return;
          (ex.sets || []).forEach(s => {
            const weight = parseFloat(s.actualWeight) || parseFloat(s.prescribedWeight) || 0;
            const reps = parseInt(s.actualReps) || parseInt(s.prescribedReps) || 0;
            const rpe = parseInt(s.rpe) || 0;
            const pain = parseInt(s.painLevel) || 0;

            if (!s.actualWeight && !s.actualReps && s.prescribedWeight) return;

            if (weight > 0 && reps > 0 && reps <= 12) {
              const e1rm = Math.round(weight * (1 + reps / 30));
              if (!maxLifts[ex.name] || e1rm > maxLifts[ex.name].e1rm) {
                maxLifts[ex.name] = { weight, reps, e1rm };
              }
            }
            if (pain > 0) {
              if (!painHistory[ex.name]) painHistory[ex.name] = { count: 0, maxPain: 0, lastDaysAgo: null, recentCount: 0 };
              painHistory[ex.name].count++;
              painHistory[ex.name].maxPain = Math.max(painHistory[ex.name].maxPain, pain);
              if (daysSince !== null) {
                if (painHistory[ex.name].lastDaysAgo === null || daysSince < painHistory[ex.name].lastDaysAgo) {
                  painHistory[ex.name].lastDaysAgo = daysSince;
                }
                if (daysSince <= 30) painHistory[ex.name].recentCount++;
              }
            }
            if (rpe > 0) {
              if (!rpeData[ex.name]) rpeData[ex.name] = { total: 0, count: 0 };
              rpeData[ex.name].total += rpe;
              rpeData[ex.name].count++;
            }
          });
        });
      });

      const rpeAverages = {};
      Object.entries(rpeData).forEach(([name, d]) => {
        rpeAverages[name] = Math.round(d.total / d.count * 10) / 10;
      });

      // Health summary
      const healthSummary = {};
      if (healthEntries.length > 0) {
        const sleepEntries = healthEntries.filter(h => h.sleep).slice(0, 7);
        if (sleepEntries.length) healthSummary.avgSleep = Math.round(sleepEntries.reduce((sum, h) => sum + h.sleep, 0) / sleepEntries.length * 10) / 10;
        const proteinEntries = healthEntries.filter(h => h.protein).slice(0, 7);
        if (proteinEntries.length) healthSummary.avgProtein = Math.round(proteinEntries.reduce((sum, h) => sum + h.protein, 0) / proteinEntries.length);
        const calorieEntries = healthEntries.filter(h => h.calories).slice(0, 7);
        if (calorieEntries.length) healthSummary.avgCalories = Math.round(calorieEntries.reduce((sum, h) => sum + h.calories, 0) / calorieEntries.length);
        const weightEntries = healthEntries.filter(h => h.weight).slice(0, 3);
        if (weightEntries.length) healthSummary.recentWeight = weightEntries[0].weight;
      }

      // Profile
      const profile = {};
      if (userProfile) {
        if (userProfile.weight) profile.weight = userProfile.weight;
        if (userProfile.height) profile.height = userProfile.height;
        if (userProfile.age) profile.age = userProfile.age;
        if (userProfile.activityLevel) profile.activityLevel = userProfile.activityLevel;
        if (userProfile.displayName) profile.displayName = userProfile.displayName;
      }
      if (healthSummary.recentWeight) profile.weight = healthSummary.recentWeight;

      // ─── FULL DETAIL for last 3 strength workouts ───
      const recentWorkoutsFull = strengthWorkouts.slice(0, 3).map(w => ({
        name: w.name,
        date: w.date,
        isGroup: w.isGroup || false,
        groupName: w.groupName,
        exercises: (w.exercises || []).map(ex => ({
          name: ex.name,
          type: ex.type || 'weight',
          sets: (ex.sets || []).map(s => ({
            prescribedWeight: s.prescribedWeight || '',
            prescribedReps: s.prescribedReps || '',
            actualWeight: s.actualWeight || '',
            actualReps: s.actualReps || '',
            prescribedTime: s.prescribedTime || '',
            actualTime: s.actualTime || '',
            rpe: s.rpe || '',
            painLevel: parseInt(s.painLevel) || 0,
          })),
        })),
      }));

      // Older workout summaries (after the 3 detailed ones)
      const olderSummaries = strengthWorkouts.slice(3, 8).map(w => ({
        name: w.name,
        date: w.date,
        exerciseCount: w.exercises?.length || 0,
        exercises: w.exercises?.slice(0, 4).map(e => ({ name: e.name, sets: e.sets?.length || 0 })),
      }));

      // ─── Load form checks, Oura, admin notes in parallel (non-blocking) ───
      const [formCheckResult, ouraResult, notesResult] = await Promise.allSettled([
        getDocs(query(
          collection(db, 'formCheckJobs'),
          where('userId', '==', user.uid),
          where('status', '==', 'complete'),
          orderBy('createdAt', 'desc'),
          limit(5)
        )).catch(() => {
          // Fallback without orderBy (no composite index needed)
          return getDocs(query(
            collection(db, 'formCheckJobs'),
            where('userId', '==', user.uid),
            where('status', '==', 'complete'),
            limit(5)
          ))
        }).then(snap => {
          const items = [];
          snap.forEach(d => {
            const fc = d.data();
            if (fc.analysis) items.push({
              exercise: fc.analysis.exercise || 'Unknown',
              score: fc.analysis.overallScore || 0,
              summary: fc.analysis.overallSummary || '',
              focusCue: fc.analysis.focusDrill?.cue || '',
              injuryRisks: (fc.analysis.injuryRisks || []).filter(r => r.severity !== 'low').map(r => ({ area: r.area, severity: r.severity })),
              date: fc.createdAt?.toDate?.()?.toISOString?.().split('T')[0] || '',
            });
          });
          // Sort client-side (in case fallback query was used without orderBy)
          items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          return items;
        }),
        ouraService.getLatestScores(user.uid),
        getDoc(doc(db, 'users', user.uid)).then(s => s.exists() ? s.data().adminNotes || '' : ''),
      ]);

      const formCheckSummary = formCheckResult.status === 'fulfilled' ? formCheckResult.value : [];
      const ouraData = ouraResult.status === 'fulfilled' ? ouraResult.value : null;
      const adminNotes = notesResult.status === 'fulfilled' ? notesResult.value : '';

      const builtContext = {
        profile,
        recentWorkoutsFull,
        recentWorkouts: olderSummaries,
        cardioWorkouts: cardioWorkouts.slice(0, 5).map(w => ({
          name: w.name, date: w.date, duration: w.duration,
          cardioType: w.cardioType, distance: w.distance,
        })),
        goals: goals.filter(g => g.status === 'active').map(g => ({
          lift: g.lift, metricType: g.metricType,
          currentWeight: g.currentWeight || g.currentValue,
          targetWeight: g.targetWeight || g.targetValue,
          targetDate: g.targetDate,
        })),
        maxLifts, painHistory, rpeAverages,
        health: healthSummary,
        schedules: schedules.filter(s => s.active !== false).map(s => ({
          name: s.name, days: s.days, duration: s.duration,
        })),
        recurringActivities: recurring.filter(r => r.active).map(r => ({
          name: r.name, type: r.type, days: r.days,
        })),
        ouraData,
        formChecks: formCheckSummary,
        adminNotes,
      };

      setContext(builtContext);
    } catch (error) {
      console.error('Error loading user context:', error);
      setContext({ recentWorkouts: [], goals: [] });
    } finally {
      setContextLoading(false);
    }
  };

  const fetchGreeting = async () => {
    if (!context || !user) return;

    // Check credits first
    const credits = userProfile?.credits ?? 0;
    if (!isAppAdmin && credits < CREDIT_COSTS['ask-assistant']) {
      setMessages([{
        role: 'assistant',
        content: "Hey! I'm your training coach. You're low on credits right now, but feel free to ask when you get more."
      }]);
      setQuickActions(["What should I do today?", "How's my progress?", "Generate a workout", "Review my last session"]);
      setGreetingFetched(true);
      return;
    }

    setGreetingLoading(true);
    try {
      incrementRateLimit();

      const response = await api.askAssistant(null, { ...context, personality: userProfile?.chatPersonality || 'coach' }, 'greeting');

      setMessages([{
        role: 'assistant',
        content: response.greeting || "Hey! Ready to train? I've got your full history — ask me anything."
      }]);

      if (response.quickActions?.length) {
        setQuickActions(response.quickActions);
      } else {
        setQuickActions(["What should I do today?", "How's my progress?", "Generate a workout", "Review my last session"]);
      }
    } catch (error) {
      console.error('Greeting fetch error:', error);
      setMessages([{
        role: 'assistant',
        content: "Hey! I'm your training coach — I've got your full workout history loaded. Ask me anything about your lifts, pain, goals, or say 'generate a workout'."
      }]);
      setQuickActions(["What should I do today?", "How's my progress?", "Generate a workout", "Review my last session"]);
    } finally {
      setGreetingLoading(false);
      setGreetingFetched(true);
    }
  };

  // Returns null (under limit), 'overage' (past limit but can continue), or cost multiplier info
  const checkRateLimit = () => {
    const now = Date.now();
    try {
      // Check for admin reset signal
      const resetAt = userProfile?.rateLimitResetAt;
      if (resetAt) {
        const resetTs = new Date(resetAt).getTime();
        const lastChecked = localStorage.getItem('ai_rate_limit_checked');
        if (!lastChecked || resetTs > parseInt(lastChecked)) {
          localStorage.removeItem('ai_rate_limit');
          localStorage.removeItem('ai_daily_limit');
          localStorage.setItem('ai_rate_limit_checked', String(now));
          setRateLimitInfo({ count: 0, resetTime: now + RATE_LIMIT_WINDOW, dailyCount: 0, dailyResetTime: now + DAILY_WINDOW });
          return null;
        }
      }

      const stored = localStorage.getItem('ai_rate_limit');
      let rateData = stored ? JSON.parse(stored) : { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
      if (now > rateData.resetTime) rateData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
      const dailyStored = localStorage.getItem('ai_daily_limit');
      let dailyData = dailyStored ? JSON.parse(dailyStored) : { count: 0, resetTime: now + DAILY_WINDOW };
      if (now > dailyData.resetTime) dailyData = { count: 0, resetTime: now + DAILY_WINDOW };
      setRateLimitInfo({ ...rateData, dailyCount: dailyData.count, dailyResetTime: dailyData.resetTime });
      if (dailyData.count >= DAILY_LIMIT || rateData.count >= RATE_LIMIT) return 'overage';
      return null;
    } catch { return null; }
  };

  // Get current credit cost per message (1 normally, Nx during overage)
  const getCurrentCreditCost = () => {
    const now = Date.now();
    try {
      const stored = localStorage.getItem('ai_rate_limit');
      let rateData = stored ? JSON.parse(stored) : { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
      if (now > rateData.resetTime) rateData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
      const dailyStored = localStorage.getItem('ai_daily_limit');
      let dailyData = dailyStored ? JSON.parse(dailyStored) : { count: 0, resetTime: now + DAILY_WINDOW };
      if (now > dailyData.resetTime) dailyData = { count: 0, resetTime: now + DAILY_WINDOW };
      if (dailyData.count >= DAILY_LIMIT || rateData.count >= RATE_LIMIT) {
        return OVERAGE_MULTIPLIER;
      }
      return 1;
    } catch { return 1; }
  };

  const incrementRateLimit = () => {
    const now = Date.now();
    try {
      const stored = localStorage.getItem('ai_rate_limit');
      let rateData = stored ? JSON.parse(stored) : { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
      if (now > rateData.resetTime) {
        rateData = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
      } else {
        rateData.count += 1;
      }
      localStorage.setItem('ai_rate_limit', JSON.stringify(rateData));

      const dailyStored = localStorage.getItem('ai_daily_limit');
      let dailyData = dailyStored ? JSON.parse(dailyStored) : { count: 0, resetTime: now + DAILY_WINDOW };
      if (now > dailyData.resetTime) {
        dailyData = { count: 1, resetTime: now + DAILY_WINDOW };
      } else {
        dailyData.count += 1;
      }
      localStorage.setItem('ai_daily_limit', JSON.stringify(dailyData));
      setRateLimitInfo({ ...rateData, dailyCount: dailyData.count, dailyResetTime: dailyData.resetTime });
    } catch {
      localStorage.removeItem('ai_rate_limit');
      localStorage.removeItem('ai_daily_limit');
    }
  };

  const getRemainingMessages = () => {
    const hourlyLeft = RATE_LIMIT - (rateLimitInfo.count || 0);
    const dailyLeft = DAILY_LIMIT - (rateLimitInfo.dailyCount || 0);
    return Math.min(hourlyLeft, dailyLeft);
  };

  const sendMessage = async (messageText) => {
    if (!messageText.trim() || loading) return;

    const isAdmin = isAppAdmin;
    const credits = userProfile?.credits ?? 0;
    const creditCost = getCurrentCreditCost(); // 1 normally, Nx during overage
    const isOverage = creditCost > 1;

    if (!isAdmin && credits < creditCost) {
      const overageMsg = isOverage
        ? `You've hit the rate limit and overage messages cost ${OVERAGE_MULTIPLIER} credits each. You only have ${credits}. Resets soon.`
        : "You're out of AI credits. More credits coming soon — check Settings for your usage.";
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: messageText },
        { role: 'assistant', content: overageMsg },
      ]);
      return;
    }

    // Just track — don't block
    checkRateLimit();

    setMessages((prev) => [...prev, { role: 'user', content: messageText }]);
    setLoading(true);

    try {
      incrementRateLimit();

      if (user?.uid && !isAdmin) {
        // Credits deducted server-side — just update local display
        updateProfile({ credits: credits - creditCost });
      }

      const response = await api.askAssistant(messageText, {
        userId: user?.uid,
        personality: userProfile?.chatPersonality || 'coach',
        ...(context || {}),
      });

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.message, workout: response.workout },
      ]);
    } catch (error) {
      if (user?.uid && !isAdmin) {
        // Server refunds on failure — restore local display
        updateProfile({ credits: credits });
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Sorry, I couldn't process that. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const messageText = input.trim();
    setInput('');
    await sendMessage(messageText);
  };

  const handleQuickAction = async (action) => {
    await sendMessage(action);
  };

  const handleSaveWorkout = async (workout, messageIndex) => {
    if (!user || !workout) return;

    setSavingWorkout(messageIndex);
    try {
      const workoutData = {
        name: workout.name || 'AI Generated Workout',
        date: new Date(),
        exercises: workout.exercises.map((ex, i) => ({
          id: Date.now() + i,
          name: ex.name,
          sets: ex.sets.map((set, j) => ({
            id: Date.now() + i * 100 + j,
            prescribedWeight: set.prescribedWeight?.toString() || '',
            prescribedReps: set.prescribedReps?.toString() || '',
            actualWeight: '',
            actualReps: '',
            rpe: '',
            painLevel: 0
          })),
          notes: ex.notes || ''
        })),
        notes: 'Generated by AI Coach',
        status: 'scheduled'
      };

      const saved = await workoutService.create(user.uid, workoutData);
      setMessages(prev => prev.map((msg, idx) =>
        idx === messageIndex
          ? { ...msg, workoutSaved: true, savedWorkoutId: saved.id }
          : msg
      ));
    } catch (error) {
      console.error('Error saving workout:', error);
      alert('Failed to save workout');
    } finally {
      setSavingWorkout(null);
    }
  };

  const isGreetingOrLoading = greetingLoading || (!greetingFetched && contextLoading);

  return (
    <AnimatePresence>
      {chatOpen && (
        <>
          {/* Backdrop for mobile */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setChatOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Chat Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 lg:inset-auto lg:bottom-6 lg:right-6 lg:w-96 lg:h-[600px]
              bg-iron-900 border border-iron-700/50 rounded-2xl z-50
              flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-iron-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-flame-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-flame-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-iron-100">AI Coach</h3>
                  <p className="text-xs text-iron-500">
                    {contextLoading ? 'Loading your data...' : context ? 'Your data is loaded' : 'Ready to help'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="p-2 text-iron-400 hover:text-iron-100 hover:bg-iron-800
                  rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {/* Loading state before greeting */}
              {isGreetingOrLoading && messages.length === 0 && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-iron-800 border border-iron-700 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-flame-400" />
                  </div>
                  <div className="bg-iron-800 px-4 py-3 rounded-2xl rounded-tl-md">
                    <div className="flex items-center gap-2 text-sm text-iron-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-flame-400" />
                      <span>{contextLoading ? 'Loading your training data...' : 'Getting your personalized greeting...'}</span>
                    </div>
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                      ${message.role === 'user'
                        ? 'bg-flame-500'
                        : 'bg-iron-800 border border-iron-700'
                      }`}
                  >
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-flame-400" />
                    )}
                  </div>
                  <div className="max-w-[85%] space-y-2">
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-sm
                        ${message.role === 'user'
                          ? 'bg-flame-500 text-white rounded-tr-md'
                          : 'bg-iron-800 text-iron-100 rounded-tl-md'
                        }`}
                    >
                      {message.content}
                    </div>

                    {/* Workout Card */}
                    {message.workout && (
                      <div className="bg-iron-800/50 border border-iron-700 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Dumbbell className="w-4 h-4 text-flame-400" />
                            <span className="font-medium text-iron-100 text-sm">
                              {message.workout.name}
                            </span>
                          </div>
                          <span className="text-xs text-iron-500">
                            {message.workout.exercises?.length} exercises
                          </span>
                        </div>

                        <div className="text-xs text-iron-400 space-y-1">
                          {message.workout.exercises?.slice(0, 3).map((ex, i) => (
                            <div key={i}>
                              {ex.name}: {ex.sets?.length} sets
                            </div>
                          ))}
                          {message.workout.exercises?.length > 3 && (
                            <div className="text-iron-500">
                              +{message.workout.exercises.length - 3} more...
                            </div>
                          )}
                        </div>

                        {message.workoutSaved ? (
                          <button
                            onClick={() => {
                              setChatOpen(false);
                              navigate(`/workouts/${message.savedWorkoutId}`);
                            }}
                            className="w-full py-2 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                          >
                            Saved - View Workout
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSaveWorkout(message.workout, index)}
                            disabled={savingWorkout === index}
                            className="w-full py-2 bg-flame-500/20 hover:bg-flame-500/30 text-flame-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                          >
                            {savingWorkout === index ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Plus className="w-4 h-4" />
                                Add to My Workouts
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-iron-800 border border-iron-700
                    flex items-center justify-center">
                    <Bot className="w-4 h-4 text-flame-400" />
                  </div>
                  <div className="bg-iron-800 px-4 py-3 rounded-2xl rounded-tl-md">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-iron-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-iron-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-iron-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            {quickActions.length > 0 && messages.length <= 2 && !loading && !isGreetingOrLoading && (
              <div className="px-4 pb-2">
                <div className="flex flex-wrap gap-2">
                  {quickActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => handleQuickAction(action)}
                      disabled={loading}
                      className="px-3 py-1.5 text-xs bg-iron-800 text-iron-300
                        border border-iron-700 rounded-full
                        hover:border-flame-500/50 hover:text-iron-100
                        transition-colors disabled:opacity-50"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-iron-800">
              {getCurrentCreditCost() > 1 && (
                <div className="mx-4 mt-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-[11px] text-yellow-400">
                    Rate limit reached — messages now cost {OVERAGE_MULTIPLIER} credits each until reset
                  </p>
                </div>
              )}
              <div className="px-4 pt-2 flex justify-between text-[10px] text-iron-600">
                <span>{userProfile?.credits ?? 0} credits left</span>
                <span>{getCurrentCreditCost()} credit{getCurrentCreditCost() > 1 ? 's' : ''} / msg</span>
              </div>
              <form
                onSubmit={handleSubmit}
                className="px-4 pb-4 pt-1.5"
              >
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your workouts..."
                  aria-label="Chat message"
                  className="flex-1 bg-iron-800 text-iron-100 px-4 py-2.5 rounded-full
                    border border-iron-700 focus:border-flame-500/50 focus:outline-none
                    placeholder:text-iron-500 text-sm"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="w-10 h-10 rounded-full bg-flame-500 text-white
                    flex items-center justify-center
                    hover:bg-flame-400 disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}