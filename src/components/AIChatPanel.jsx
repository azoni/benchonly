import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, Sparkles, Bot, User, Plus, Dumbbell } from 'lucide-react';
import { useUIStore } from '../store';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { workoutService, goalService, healthService, userService, scheduleService, recurringActivityService } from '../services/firestore';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';

export default function AIChatPanel() {
  const navigate = useNavigate();
  const { chatOpen, setChatOpen } = useUIStore();
  const { user, userProfile } = useAuth();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hey! I'm your workout assistant. I have access to your full training data — ask me about your lifts, pain history, goals, or say 'generate a workout' and I'll create one you can save.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(null);
  const [context, setContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState({ count: 0, resetTime: null });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const RATE_LIMIT = 8; // requests per hour
  const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms
  const DAILY_LIMIT = 25;
  const DAILY_WINDOW = 24 * 60 * 60 * 1000;

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
    }
  }, [chatOpen]);

  const loadUserContext = async () => {
    if (!user) return;
    setContextLoading(true);
    try {
      // Load everything in parallel
      const [goals, healthEntries, schedules, recurring] = await Promise.all([
        goalService.getByUser(user.uid).catch(() => []),
        healthService.getByUser(user.uid, 14).catch(() => []),
        scheduleService.getByUser(user.uid).catch(() => []),
        recurringActivityService.getByUser(user.uid).catch(() => []),
      ]);

      // Load workouts (strength + cardio together)
      let allWorkouts = [];
      try {
        const snap = await getDocs(query(
          collection(db, 'workouts'), where('userId', '==', user.uid), limit(50)
        ));
        allWorkouts = snap.docs.map(doc => {
          const d = doc.data();
          const workoutDate = d.date?.toDate?.() || new Date(d.date);
          return { ...d, date: workoutDate.toISOString().split('T')[0] };
        });
      } catch (e) { console.error(e); }

      // Load group workouts
      try {
        const snap = await getDocs(query(
          collection(db, 'groupWorkouts'), where('assignedTo', '==', user.uid), limit(30)
        ));
        snap.docs.forEach(doc => {
          const d = doc.data();
          const workoutDate = d.date?.toDate?.() || new Date(d.date);
          allWorkouts.push({ ...d, date: workoutDate.toISOString().split('T')[0], isGroup: true });
        });
      } catch (e) { console.error(e); }

      allWorkouts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      // Separate cardio vs strength
      const cardioWorkouts = allWorkouts.filter(w => w.workoutType === 'cardio').slice(0, 10);
      const strengthWorkouts = allWorkouts.filter(w => w.workoutType !== 'cardio');

      // Build max lifts, pain history, RPE data from strength workouts
      const maxLifts = {};
      const painHistory = {};
      const rpeData = {};

      strengthWorkouts.slice(0, 25).forEach(w => {
        (w.exercises || []).forEach(ex => {
          if (!ex.name) return;
          (ex.sets || []).forEach(s => {
            const weight = parseFloat(s.actualWeight) || parseFloat(s.prescribedWeight) || 0;
            const reps = parseInt(s.actualReps) || parseInt(s.prescribedReps) || 0;
            const rpe = parseInt(s.rpe) || 0;
            const pain = parseInt(s.painLevel) || 0;

            if (weight > 0 && reps > 0 && reps <= 12) {
              const e1rm = Math.round(weight * (1 + reps / 30));
              if (!maxLifts[ex.name] || e1rm > maxLifts[ex.name].e1rm) {
                maxLifts[ex.name] = { weight, reps, e1rm };
              }
            }
            if (pain > 0) {
              if (!painHistory[ex.name]) painHistory[ex.name] = { count: 0, maxPain: 0 };
              painHistory[ex.name].count++;
              painHistory[ex.name].maxPain = Math.max(painHistory[ex.name].maxPain, pain);
            }
            if (rpe > 0) {
              if (!rpeData[ex.name]) rpeData[ex.name] = { total: 0, count: 0 };
              rpeData[ex.name].total += rpe;
              rpeData[ex.name].count++;
            }
          });
        });
      });

      // Build RPE averages
      const rpeAverages = {};
      Object.entries(rpeData).forEach(([name, d]) => {
        rpeAverages[name] = Math.round(d.total / d.count * 10) / 10;
      });

      // Build health summary from recent entries
      const healthSummary = {};
      if (healthEntries.length > 0) {
        const sleepEntries = healthEntries.filter(h => h.sleep).slice(0, 7);
        if (sleepEntries.length) {
          healthSummary.avgSleep = Math.round(sleepEntries.reduce((sum, h) => sum + h.sleep, 0) / sleepEntries.length * 10) / 10;
        }
        const proteinEntries = healthEntries.filter(h => h.protein).slice(0, 7);
        if (proteinEntries.length) {
          healthSummary.avgProtein = Math.round(proteinEntries.reduce((sum, h) => sum + h.protein, 0) / proteinEntries.length);
        }
        const calorieEntries = healthEntries.filter(h => h.calories).slice(0, 7);
        if (calorieEntries.length) {
          healthSummary.avgCalories = Math.round(calorieEntries.reduce((sum, h) => sum + h.calories, 0) / calorieEntries.length);
        }
        const weightEntries = healthEntries.filter(h => h.weight).slice(0, 3);
        if (weightEntries.length) {
          healthSummary.recentWeight = weightEntries[0].weight;
        }
      }

      // Profile data
      const profile = {};
      if (userProfile) {
        if (userProfile.weight) profile.weight = userProfile.weight;
        if (userProfile.height) profile.height = userProfile.height;
        if (userProfile.age) profile.age = userProfile.age;
        if (userProfile.activityLevel) profile.activityLevel = userProfile.activityLevel;
        if (userProfile.displayName) profile.displayName = userProfile.displayName;
      }
      // Override weight with latest health entry if available
      if (healthSummary.recentWeight) profile.weight = healthSummary.recentWeight;

      const builtContext = {
        profile,
        // Just names/dates/exercise counts - maxLifts/painHistory/rpeAverages cover the details
        recentWorkouts: strengthWorkouts.slice(0, 5).map(w => ({
          name: w.name,
          date: w.date,
          exerciseCount: w.exercises?.length || 0,
          exercises: w.exercises?.slice(0, 4).map(e => ({ name: e.name, sets: e.sets?.length || 0 })),
        })),
        cardioWorkouts: cardioWorkouts.slice(0, 5).map(w => ({
          name: w.name,
          date: w.date,
          duration: w.duration,
          cardioType: w.cardioType,
          distance: w.distance,
        })),
        goals: goals.filter(g => g.status === 'active').map(g => ({
          lift: g.lift,
          metricType: g.metricType,
          currentWeight: g.currentWeight || g.currentValue,
          targetWeight: g.targetWeight || g.targetValue,
          targetDate: g.targetDate,
        })),
        maxLifts,
        painHistory,
        rpeAverages,
        health: healthSummary,
        schedules: schedules.filter(s => s.active !== false).map(s => ({
          name: s.name,
          days: s.days,
          duration: s.duration,
        })),
        recurringActivities: recurring.filter(r => r.active).map(r => ({
          name: r.name,
          type: r.type,
          days: r.days,
        })),
      };

      setContext(builtContext);
    } catch (error) {
      console.error('Error loading user context:', error);
      setContext({ recentWorkouts: [], goals: [] }); // fallback
    } finally {
      setContextLoading(false);
    }
  };

  const checkRateLimit = () => {
    const now = Date.now();
    
    // Hourly limit
    const stored = localStorage.getItem('ai_rate_limit');
    let rateData = stored ? JSON.parse(stored) : { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    if (now > rateData.resetTime) {
      rateData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    }
    
    // Daily limit
    const dailyStored = localStorage.getItem('ai_daily_limit');
    let dailyData = dailyStored ? JSON.parse(dailyStored) : { count: 0, resetTime: now + DAILY_WINDOW };
    if (now > dailyData.resetTime) {
      dailyData = { count: 0, resetTime: now + DAILY_WINDOW };
    }
    
    setRateLimitInfo({ ...rateData, dailyCount: dailyData.count, dailyResetTime: dailyData.resetTime });
    
    if (dailyData.count >= DAILY_LIMIT) return 'daily';
    if (rateData.count >= RATE_LIMIT) return 'hourly';
    return null;
  };

  const incrementRateLimit = () => {
    const now = Date.now();
    
    // Hourly
    const stored = localStorage.getItem('ai_rate_limit');
    let rateData = stored ? JSON.parse(stored) : { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    if (now > rateData.resetTime) {
      rateData = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
    } else {
      rateData.count += 1;
    }
    localStorage.setItem('ai_rate_limit', JSON.stringify(rateData));
    
    // Daily
    const dailyStored = localStorage.getItem('ai_daily_limit');
    let dailyData = dailyStored ? JSON.parse(dailyStored) : { count: 0, resetTime: now + DAILY_WINDOW };
    if (now > dailyData.resetTime) {
      dailyData = { count: 1, resetTime: now + DAILY_WINDOW };
    } else {
      dailyData.count += 1;
    }
    localStorage.setItem('ai_daily_limit', JSON.stringify(dailyData));
    
    setRateLimitInfo({ ...rateData, dailyCount: dailyData.count, dailyResetTime: dailyData.resetTime });
  };

  const getRemainingMessages = () => {
    const hourlyLeft = RATE_LIMIT - (rateLimitInfo.count || 0);
    const dailyLeft = DAILY_LIMIT - (rateLimitInfo.dailyCount || 0);
    return Math.min(hourlyLeft, dailyLeft);
  };

  const sendMessage = async (messageText) => {
    if (!messageText.trim() || loading) return;
    
    // Check rate limit
    const limitHit = checkRateLimit();
    if (limitHit) {
      const minutesLeft = limitHit === 'daily' 
        ? Math.ceil((rateLimitInfo.dailyResetTime - Date.now()) / 1000 / 60)
        : Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000 / 60);
      const hoursLeft = Math.ceil(minutesLeft / 60);
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: messageText },
        {
          role: 'assistant',
          content: limitHit === 'daily'
            ? `You've reached the daily limit of ${DAILY_LIMIT} messages. Resets in ${hoursLeft > 1 ? `${hoursLeft} hours` : `${minutesLeft} minutes`}.`
            : `You've reached the limit of ${RATE_LIMIT} messages per hour. Try again in ${minutesLeft} minutes.`,
        },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', content: messageText }]);
    setLoading(true);

    try {
      incrementRateLimit();
      const response = await api.askAssistant(messageText, {
        userId: user?.uid,
        ...(context || {}),
      });

      setMessages((prev) => [
        ...prev,
        { 
          role: 'assistant', 
          content: response.message,
          workout: response.workout
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I couldn't process that. Please try again.",
        },
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
      // Format the workout for saving
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
        notes: 'Generated by AI Assistant',
        status: 'scheduled'
      };

      const saved = await workoutService.create(user.uid, workoutData);
      
      // Update the message to show it was saved
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

  const quickActions = [
    "Generate a push workout",
    "What should I do today?",
    "Suggest weights for bench",
    "How's my progress?",
  ];

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
                  <h3 className="font-semibold text-iron-100">AI Assistant</h3>
                  <p className="text-xs text-iron-500">Always here to help</p>
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
              {/* Context loading indicator */}
              {contextLoading && (
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-iron-500">
                  <Loader2 className="w-3 h-3 animate-spin text-flame-400" />
                  Loading your training data...
                </div>
              )}
              {context && !contextLoading && (
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-iron-600">
                  <Sparkles className="w-3 h-3 text-green-500" />
                  Connected to your workout data
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
                              • {ex.name}: {ex.sets?.length} sets
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
                            ✓ Saved - View Workout
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
            {messages.length <= 2 && !loading && (
              <div className="px-4 pb-2">
                <p className="text-xs text-iron-500 mb-2">Quick actions</p>
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
              <div className="px-4 pt-2 flex justify-between text-[10px] text-iron-600">
                <span>{getRemainingMessages()} messages left</span>
                <span>gpt-4o-mini</span>
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