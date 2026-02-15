import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  Loader2,
  Users,
  Check,
  AlertTriangle,
  Calendar,
  Dumbbell,
  Brain,
  ChevronDown,
  ChevronUp,
  Zap,
  MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../services/api';
import { creditService, CREDIT_COSTS, PREMIUM_CREDIT_COST } from '../services/firestore';
import { apiUrl } from '../utils/platform'

// Simulated thinking messages that rotate during AI generation
const THINKING_MESSAGES = [
  { text: 'Loading athlete profiles and training histories...', icon: 'users' },
  { text: 'Scanning recent workout data for volume and intensity trends...', icon: 'brain' },
  { text: 'Evaluating pain history and flagging injury risks...', icon: 'alert' },
  { text: 'Calculating estimated 1-rep maxes from recent sets...', icon: 'calc' },
  { text: 'Reviewing RPE averages to calibrate load recommendations...', icon: 'brain' },
  { text: 'Checking recovery status based on recent training frequency...', icon: 'brain' },
  { text: 'Selecting primary compound movements for the session...', icon: 'dumbbell' },
  { text: 'Adding accessory exercises to target weak points...', icon: 'dumbbell' },
  { text: 'Personalizing working weights per athlete based on e1RM...', icon: 'users' },
  { text: 'Applying progressive overload — adjusting from last session...', icon: 'calc' },
  { text: 'Building set/rep schemes for target intensity zone...', icon: 'dumbbell' },
  { text: 'Checking for exercise substitutions where pain was flagged...', icon: 'alert' },
  { text: 'Writing coaching notes and form cues for each exercise...', icon: 'msg' },
  { text: 'Generating individualized notes for each athlete...', icon: 'users' },
  { text: 'Validating workout structure and total volume...', icon: 'calc' },
];

export default function GenerateGroupWorkoutModal({ 
  isOpen, 
  onClose, 
  group, 
  athletes,
  coachId,
  isAdmin = false,
  onSuccess 
}) {
  const [prompt, setPrompt] = useState('');
  const { user, userProfile, updateProfile, isAppAdmin: contextIsAdmin } = useAuth();
  const [workoutDate, setWorkoutDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [athleteContexts, setAthleteContexts] = useState({});
  const [loadingContext, setLoadingContext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [model, setModel] = useState('standard');
  const [workoutFocus, setWorkoutFocus] = useState('auto');
  const [intensity, setIntensity] = useState('moderate');
  const [duration, setDuration] = useState('auto');
  const [exerciseCount, setExerciseCount] = useState('auto');
  const [maxExercise, setMaxExercise] = useState('');
  
  // Analysis tracking
  const [analysisSteps, setAnalysisSteps] = useState([]);
  const [expandedAthlete, setExpandedAthlete] = useState(null);
  
  // AI thinking state
  const [thinkingMessages, setThinkingMessages] = useState([]);
  const thinkingRef = useRef(null);
  const thinkingIntervalRef = useRef(null);

  useEffect(() => {
    if (isOpen && athletes?.length > 0) {
      setSelectedAthletes(athletes.map(a => a.uid));
      loadAthleteContexts(athletes);
    }
  }, [isOpen, athletes]);

  // Auto-scroll thinking messages
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinkingMessages]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (thinkingIntervalRef.current) clearInterval(thinkingIntervalRef.current);
    };
  }, []);

  const addStep = (label, status, detail = null) => {
    setAnalysisSteps(prev => {
      const existing = prev.findIndex(s => s.label === label);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { label, status, detail };
        return updated;
      }
      return [...prev, { label, status, detail }];
    });
  };

  const startThinkingAnimation = () => {
    setThinkingMessages([]);
    let index = 0;
    
    // Add first message immediately
    setThinkingMessages([{ ...THINKING_MESSAGES[0], id: 0 }]);
    index = 1;
    
    thinkingIntervalRef.current = setInterval(() => {
      if (index < THINKING_MESSAGES.length) {
        setThinkingMessages(prev => [...prev, { ...THINKING_MESSAGES[index], id: index }]);
        index++;
      } else {
        // Loop with "still working" messages
        setThinkingMessages(prev => [...prev, { 
          text: 'Finalizing workout details...', 
          icon: 'brain', 
          id: prev.length 
        }]);
      }
    }, 2200);
  };

  const stopThinkingAnimation = () => {
    if (thinkingIntervalRef.current) {
      clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
  };

  const loadAthleteContexts = async (athleteList) => {
    setLoadingContext(true);
    setAnalysisSteps([]);
    const contexts = {};

    for (const athlete of athleteList) {
      const name = athlete.displayName || 'Unknown';
      addStep(`Analyzing ${name}`, 'loading');
      
      try {
        const ctx = await gatherAthleteContext(athlete.uid);
        contexts[athlete.uid] = { ...ctx, name };
        
        const liftCount = Object.keys(ctx.maxLifts || {}).length;
        const painCount = Object.keys(ctx.painHistory || {}).length;
        let detail = `${liftCount} lifts`;
        if (painCount > 0) detail += `, ${painCount} pain flags`;
        
        addStep(`Analyzing ${name}`, painCount > 0 ? 'warning' : 'complete', detail);
      } catch (err) {
        console.error(`Error for ${athlete.uid}:`, err);
        contexts[athlete.uid] = {
          id: athlete.uid, name,
          maxLifts: {}, painHistory: {}, rpeAverages: {}, goals: [], recentWorkouts: [],
        };
        addStep(`Analyzing ${name}`, 'complete', 'No data');
      }
    }

    setAthleteContexts(contexts);
    setLoadingContext(false);
  };

  const gatherAthleteContext = async (athleteId) => {
    let allWorkouts = [];

    try {
      const snap = await getDocs(query(
        collection(db, 'workouts'), where('userId', '==', athleteId), limit(30)
      ));
      snap.docs.forEach(doc => {
        const d = doc.data();
        if (d.status === 'completed') {
          allWorkouts.push({
            ...d, date: d.date?.toDate?.()?.toISOString?.().split('T')[0] || d.date,
          });
        }
      });
    } catch (e) { console.error(e); }

    try {
      const snap = await getDocs(query(
        collection(db, 'groupWorkouts'), where('assignedTo', '==', athleteId), limit(30)
      ));
      snap.docs.forEach(doc => {
        const d = doc.data();
        if (d.status === 'completed') {
          allWorkouts.push({
            ...d, date: d.date?.toDate?.()?.toISOString?.().split('T')[0] || d.date,
          });
        }
      });
    } catch (e) { console.error(e); }

    allWorkouts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const maxLifts = {};
    const painHistory = {};
    const rpeData = {};

    allWorkouts.forEach(w => {
      (w.exercises || []).forEach(ex => {
        if (!ex.name) return;
        (ex.sets || []).forEach(s => {
          // Skip sets with only prescribed data (not actually performed)
          if (!s.actualWeight && !s.actualReps && s.prescribedWeight) return;
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

    const rpeAverages = {};
    Object.entries(rpeData).forEach(([n, d]) => {
      rpeAverages[n] = Math.round(d.total / d.count * 10) / 10;
    });

    let goals = [];
    try {
      const snap = await getDocs(query(
        collection(db, 'goals'), where('userId', '==', athleteId), limit(10)
      ));
      goals = snap.docs.map(d => d.data()).filter(g => g.status === 'active');
    } catch (e) { console.error(e); }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const formattedWorkouts = allWorkouts.slice(0, 5).map(w => {
      const workoutDate = new Date(w.date);
      return {
        ...w, dayOfWeek: dayNames[workoutDate.getDay()],
        exercises: (w.exercises || []).map(ex => ({
          name: ex.name, type: ex.type || 'weight', notes: ex.notes,
          sets: (ex.sets || []).map(s => ({
            prescribedWeight: s.prescribedWeight, prescribedReps: s.prescribedReps,
            actualWeight: s.actualWeight, actualReps: s.actualReps,
            rpe: s.rpe, painLevel: s.painLevel, completed: s.completed,
          })),
        })),
      };
    });

    return { id: athleteId, maxLifts, painHistory, rpeAverages, goals, recentWorkouts: formattedWorkouts };
  };

  const handleGenerate = async () => {
    if (selectedAthletes.length === 0) {
      setError('Select at least one athlete');
      return;
    }

    // Check credits — premium costs 100, standard costs 5 per athlete — admin bypasses
    const baseCost = model === 'premium' ? PREMIUM_CREDIT_COST : CREDIT_COSTS['generate-group-workout'] * selectedAthletes.length;
    const creditCost = baseCost;
    const credits = userProfile?.credits ?? 0;
    if (!isAdmin && credits < creditCost) {
      setError(model === 'premium'
        ? `Not enough credits. Premium costs ${PREMIUM_CREDIT_COST} credits, you have ${credits}.`
        : `Not enough credits. Need ${creditCost} (${CREDIT_COSTS['generate-group-workout']} x ${selectedAthletes.length} athletes) but you have ${credits}.`);
      return;
    }

    setLoading(true);
    setError(null);
    addStep('Generating workouts', 'loading');
    startThinkingAnimation();

    try {
      // Credits deducted server-side — just update local display
      if (!isAdmin) {
        updateProfile({ credits: credits - creditCost });
      }

      const athleteData = selectedAthletes.map(uid => ({
        id: uid,
        name: athleteContexts[uid]?.name || 'Unknown',
        maxLifts: athleteContexts[uid]?.maxLifts || {},
        painHistory: athleteContexts[uid]?.painHistory || {},
        rpeAverages: athleteContexts[uid]?.rpeAverages || {},
        goals: athleteContexts[uid]?.goals || [],
        recentWorkouts: athleteContexts[uid]?.recentWorkouts || [],
      }));

      const authHeaders = await getAuthHeaders();
      const response = await fetch(apiUrl('generate-group-workout'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          groupId: group.id, athletes: athleteData,
          prompt, workoutDate,
          model,
          workoutFocus,
          intensity,
          duration: duration !== 'auto' ? parseInt(duration) : null,
          exerciseCount: exerciseCount !== 'auto' ? parseInt(exerciseCount) : null,
          maxExercise: workoutFocus === '1rm-test' ? maxExercise : null,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate');
      }

      const data = await response.json();
      setResult(data);
      stopThinkingAnimation();
      
      // Add completion thinking message
      setThinkingMessages(prev => [...prev, { 
        text: `Done! Created ${data.createdWorkouts?.length} personalized workouts.`, 
        icon: 'check', 
        id: prev.length 
      }]);
      
      addStep('Generating workouts', 'complete', 
        `${data.createdWorkouts?.length} workouts created in ${data.usage?.responseMs}ms`
      );

    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
      // Server refunds on failure — restore local display
      if (!isAdmin) {
        updateProfile({ credits });
      }
      stopThinkingAnimation();
      setThinkingMessages(prev => [...prev, { 
        text: `Error: ${err.message}`, icon: 'error', id: prev.length 
      }]);
      addStep('Generating workouts', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    onSuccess?.();
    handleClose();
  };

  const toggleAthlete = (uid) => {
    setSelectedAthletes(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const toggleAll = () => {
    setSelectedAthletes(
      selectedAthletes.length === athletes?.length ? [] : athletes?.map(a => a.uid) || []
    );
  };

  const handleClose = () => {
    setPrompt('');
    setModel('standard');
    setResult(null);
    setError(null);
    setAnalysisSteps([]);
    setThinkingMessages([]);
    stopThinkingAnimation();
    onClose();
  };

  const getThinkingIcon = (icon) => {
    switch (icon) {
      case 'brain': return <Brain className="w-3 h-3 text-flame-400" />;
      case 'alert': return <AlertTriangle className="w-3 h-3 text-amber-400" />;
      case 'calc': return <Sparkles className="w-3 h-3 text-purple-400" />;
      case 'dumbbell': return <Dumbbell className="w-3 h-3 text-cyan-400" />;
      case 'users': return <Users className="w-3 h-3 text-green-400" />;
      case 'msg': return <MessageSquare className="w-3 h-3 text-blue-400" />;
      case 'check': return <Check className="w-3 h-3 text-green-400" />;
      case 'error': return <AlertTriangle className="w-3 h-3 text-red-400" />;
      default: return <Loader2 className="w-3 h-3 text-flame-400 animate-spin" />;
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-iron-900 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-iron-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-flame-500/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-flame-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-iron-100">AI Generate Workout</h2>
                <p className="text-sm text-iron-500">{group?.name}</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 text-iron-400 hover:text-iron-200 rounded-xl">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:gap-4 p-4">
              
              {/* Left - Analysis Panel */}
              <div className="lg:col-span-1 mb-4 lg:mb-0">
                <div className="bg-iron-800/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Brain className="w-4 h-4 text-flame-400" />
                    <h3 className="text-sm font-medium text-iron-300">Analysis</h3>
                  </div>
                  
                  <div className="space-y-2">
                    {analysisSteps.map((step, i) => (
                      <motion.div
                        key={step.label}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-start gap-2"
                      >
                        <div className="mt-0.5">
                          {step.status === 'loading' ? (
                            <Loader2 className="w-3 h-3 text-flame-400 animate-spin" />
                          ) : step.status === 'complete' ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : step.status === 'warning' ? (
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-iron-300">{step.label}</p>
                          {step.detail && (
                            <p className="text-xs text-iron-500 truncate">{step.detail}</p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  
                  {/* AI Thinking Stream — shows during generation */}
                  {(loading || thinkingMessages.length > 0) && (
                    <div className="mt-4 pt-4 border-t border-iron-700">
                      <div className="flex items-center gap-2 mb-2">
                        {loading && <Loader2 className="w-3 h-3 text-flame-400 animate-spin" />}
                        <p className="text-xs text-iron-500 uppercase tracking-wider">
                          {loading ? 'AI Thinking...' : 'AI Process'}
                        </p>
                      </div>
                      <div 
                        ref={thinkingRef}
                        className="max-h-40 overflow-y-auto space-y-1.5 scrollbar-thin"
                      >
                        {thinkingMessages.map((msg) => (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-start gap-2"
                          >
                            <div className="mt-0.5 flex-shrink-0">
                              {getThinkingIcon(msg.icon)}
                            </div>
                            <p className="text-xs text-iron-400 leading-relaxed">{msg.text}</p>
                          </motion.div>
                        ))}
                        {loading && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="w-1 h-1 bg-flame-400 rounded-full animate-pulse" />
                            <span className="w-1 h-1 bg-flame-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                            <span className="w-1 h-1 bg-flame-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Summary Stats */}
                  {!loadingContext && Object.keys(athleteContexts).length > 0 && !loading && thinkingMessages.length === 0 && (
                    <div className="mt-4 pt-4 border-t border-iron-700">
                      <p className="text-xs text-iron-500 mb-2">Group Summary</p>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-iron-800/50 rounded-lg py-2">
                          <p className="text-lg font-semibold text-iron-100">{selectedAthletes.length}</p>
                          <p className="text-xs text-iron-500">Athletes</p>
                        </div>
                        <div className="bg-iron-800/50 rounded-lg py-2">
                          <p className="text-lg font-semibold text-iron-100">
                            {Object.values(athleteContexts).filter(c => Object.keys(c.painHistory || {}).length > 0).length}
                          </p>
                          <p className="text-xs text-iron-500">With Pain</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Right - Options or Results */}
              <div className="lg:col-span-2">
                {loading ? (
                  /* AI Thinking Display - shown during generation */
                  <div className="space-y-4">
                    <div className="bg-iron-800/30 rounded-xl border border-flame-500/20 overflow-hidden">
                      <div className="flex items-center gap-2 p-4 border-b border-iron-700/50 bg-flame-500/5">
                        <div className="w-8 h-8 rounded-lg bg-flame-500/20 flex items-center justify-center">
                          <Brain className="w-4 h-4 text-flame-400 animate-pulse" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-iron-200">AI is generating workouts...</h3>
                          <p className="text-xs text-iron-500">{selectedAthletes.length} athlete{selectedAthletes.length !== 1 ? 's' : ''} · {prompt || 'Custom workout'}</p>
                        </div>
                        <Loader2 className="w-5 h-5 text-flame-400 animate-spin ml-auto" />
                      </div>
                      <div 
                        ref={thinkingRef}
                        className="p-4 max-h-[300px] overflow-y-auto space-y-2.5 scrollbar-thin"
                      >
                        {thinkingMessages.map((msg) => (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-start gap-3 py-1"
                          >
                            <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded bg-iron-800 flex items-center justify-center">
                              {getThinkingIcon(msg.icon)}
                            </div>
                            <p className="text-sm text-iron-300 leading-relaxed">{msg.text}</p>
                          </motion.div>
                        ))}
                        <div className="flex items-center gap-1.5 pt-2">
                          <span className="w-1.5 h-1.5 bg-flame-400 rounded-full animate-pulse" />
                          <span className="w-1.5 h-1.5 bg-flame-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                          <span className="w-1.5 h-1.5 bg-flame-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                        </div>
                      </div>
                    </div>
                    
                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-sm text-red-400">{error}</p>
                      </div>
                    )}
                  </div>
                ) : !result ? (
                  <div className="space-y-4">
                    {/* Prompt */}
                    <div>
                      <label className="block text-sm text-iron-400 mb-2">Workout description (optional)</label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., 'Heavy bench day' or 'Focus on weak points'"
                        className="input-field w-full min-h-[60px] resize-none"
                      />
                    </div>

                    {/* Style */}
                    <div>
                      <label className="block text-sm text-iron-400 mb-2">Style</label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { value: 'auto', label: 'Auto' },
                          { value: 'push', label: 'Push' },
                          { value: 'pull', label: 'Pull' },
                          { value: 'legs', label: 'Legs' },
                          { value: 'upper', label: 'Upper' },
                          { value: 'full', label: 'Full Body' },
                          { value: 'bench', label: 'Bench Focus' },
                          { value: 'no-equipment', label: 'Bodyweight' },
                          { value: '1rm-test', label: 'Test 1RM' },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setWorkoutFocus(opt.value)
                              if (opt.value !== '1rm-test') setMaxExercise('')
                            }}
                            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors
                              ${workoutFocus === opt.value
                                ? opt.value === '1rm-test' ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400' : 'border-flame-500 bg-flame-500/10 text-flame-400'
                                : 'border-iron-700 text-iron-400 hover:border-iron-600'
                              }`}
                          >
                            {opt.label}
                            {opt.value === '1rm-test' && <span className="ml-1 text-[9px] px-1 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium leading-none">New</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 1RM exercise picker */}
                    {workoutFocus === '1rm-test' && (
                      <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                        <label className="block text-sm text-yellow-400 mb-2">Which lift?</label>
                        <input
                          type="text"
                          value={maxExercise}
                          onChange={(e) => setMaxExercise(e.target.value)}
                          placeholder="e.g. Bench Press, Squat, Deadlift..."
                          className="input-field w-full"
                        />
                        <p className="text-xs text-iron-600 mt-1.5">AI generates warm-up ramps and max attempt protocol per athlete.</p>
                      </div>
                    )}

                    {/* Intensity — hidden for 1RM */}
                    {workoutFocus !== '1rm-test' && (
                      <div>
                        <label className="block text-sm text-iron-400 mb-2">Intensity</label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { value: 'light', label: 'Light', desc: 'RPE 5-6' },
                            { value: 'moderate', label: 'Moderate', desc: 'RPE 7-8' },
                            { value: 'heavy', label: 'Heavy', desc: 'RPE 8-9' },
                            { value: 'max', label: 'Max', desc: 'RPE 9-10' },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setIntensity(opt.value)}
                              className={`px-2 py-1.5 text-xs rounded-lg border transition-colors text-center
                                ${intensity === opt.value
                                  ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                                  : 'border-iron-700 text-iron-400 hover:border-iron-600'
                                }`}
                            >
                              <div className="font-medium">{opt.label}</div>
                              <div className="text-[10px] text-iron-500">{opt.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Duration & Exercises — hidden for 1RM */}
                    {workoutFocus !== '1rm-test' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm text-iron-400 mb-2">Duration</label>
                          <div className="flex flex-wrap gap-1">
                            {[
                              { value: 'auto', label: 'Auto' },
                              { value: '20', label: '20m' },
                              { value: '30', label: '30m' },
                              { value: '45', label: '45m' },
                              { value: '60', label: '60m' },
                              { value: '90', label: '90m' },
                            ].map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => setDuration(opt.value)}
                                className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors
                                  ${duration === opt.value
                                    ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                                    : 'border-iron-700 text-iron-400 hover:border-iron-600'
                                  }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm text-iron-400 mb-2">Exercises</label>
                          <div className="flex flex-wrap gap-1">
                            {[
                              { value: 'auto', label: 'Auto' },
                              { value: '3', label: '3' },
                              { value: '4', label: '4' },
                              { value: '5', label: '5' },
                              { value: '6', label: '6' },
                              { value: '8', label: '8' },
                            ].map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => setExerciseCount(opt.value)}
                                className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors
                                  ${exerciseCount === opt.value
                                    ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                                    : 'border-iron-700 text-iron-400 hover:border-iron-600'
                                  }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Date & Model */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-iron-400 mb-2">Date</label>
                        <input
                          type="date"
                          value={workoutDate}
                          onChange={(e) => setWorkoutDate(e.target.value)}
                          className="input-field w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-iron-400 mb-2">AI Model</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => setModel('standard')}
                            className={`px-2 py-1.5 text-xs rounded-lg border transition-colors text-center
                              ${model === 'standard'
                                ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                                : 'border-iron-700 text-iron-400 hover:border-iron-600'
                              }`}
                          >
                            <div className="font-medium flex items-center justify-center gap-1"><Zap className="w-3 h-3" />Standard</div>
                            <div className="text-[10px] text-iron-500">{CREDIT_COSTS['generate-group-workout']}/athlete</div>
                          </button>
                          <button
                            onClick={() => setModel('premium')}
                            className={`px-2 py-1.5 text-xs rounded-lg border transition-colors text-center
                              ${model === 'premium'
                                ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                                : 'border-iron-700 text-iron-400 hover:border-iron-600'
                              }`}
                          >
                            <div className="font-medium flex items-center justify-center gap-1"><Sparkles className="w-3 h-3" />Premium</div>
                            <div className="text-[10px] text-iron-500">{PREMIUM_CREDIT_COST} cr</div>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Athletes */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-iron-400 flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          Athletes ({selectedAthletes.length}/{athletes?.length || 0})
                        </label>
                        <button onClick={toggleAll} className="text-xs text-flame-400 hover:text-flame-300">
                          {selectedAthletes.length === athletes?.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {athletes?.map((a) => {
                          const ctx = athleteContexts[a.uid];
                          const hasPain = Object.keys(ctx?.painHistory || {}).length > 0;
                          const liftCount = Object.keys(ctx?.maxLifts || {}).length;
                          const isExpanded = expandedAthlete === a.uid;
                          
                          return (
                            <div key={a.uid} className="border border-iron-700 rounded-lg overflow-hidden">
                              <button
                                onClick={() => toggleAthlete(a.uid)}
                                className={`w-full flex items-center gap-3 p-3 transition-colors
                                  ${selectedAthletes.includes(a.uid) ? 'bg-flame-500/10' : 'bg-iron-800/50 hover:bg-iron-800'}`}
                              >
                                <div className={`w-5 h-5 rounded border flex items-center justify-center
                                  ${selectedAthletes.includes(a.uid) ? 'border-flame-500 bg-flame-500' : 'border-iron-600'}`}
                                >
                                  {selectedAthletes.includes(a.uid) && <Check className="w-3 h-3 text-white" />}
                                </div>
                                {a.photoURL ? (
                                  <img src={a.photoURL} alt="" className="w-6 h-6 rounded-full" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-iron-700 flex items-center justify-center text-xs text-iron-400">
                                    {a.displayName?.[0]}
                                  </div>
                                )}
                                <span className="text-iron-200 flex-1 text-left">{a.displayName}</span>
                                <span className="text-xs text-iron-500">{liftCount} lifts</span>
                                {hasPain && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedAthlete(isExpanded ? null : a.uid);
                                  }}
                                  className="p-1 hover:bg-iron-700 rounded"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4 text-iron-400" /> : <ChevronDown className="w-4 h-4 text-iron-400" />}
                                </button>
                              </button>
                              
                              <AnimatePresence>
                                {isExpanded && ctx && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-t border-iron-700 bg-iron-800/30"
                                  >
                                    <div className="p-3 text-xs space-y-2">
                                      {Object.keys(ctx.maxLifts || {}).length > 0 && (
                                        <div>
                                          <p className="text-iron-500 mb-1">Top Lifts</p>
                                          <div className="flex flex-wrap gap-1">
                                            {Object.entries(ctx.maxLifts)
                                              .sort((a, b) => b[1].e1rm - a[1].e1rm)
                                              .slice(0, 4)
                                              .map(([name, data]) => (
                                                <span key={name} className="bg-iron-700 px-2 py-0.5 rounded text-iron-300">
                                                  {name}: {data.e1rm}lb
                                                </span>
                                              ))}
                                          </div>
                                        </div>
                                      )}
                                      {Object.keys(ctx.painHistory || {}).length > 0 && (
                                        <div>
                                          <p className="text-amber-400 mb-1">Pain History</p>
                                          <div className="flex flex-wrap gap-1">
                                            {Object.entries(ctx.painHistory).map(([name, data]) => (
                                              <span key={name} className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
                                                {name}: {data.maxPain}/10
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {ctx.goals?.length > 0 && (
                                        <div>
                                          <p className="text-iron-500 mb-1">Goals</p>
                                          {ctx.goals.slice(0, 2).map((g, i) => (
                                            <p key={i} className="text-iron-400">
                                              {g.lift}: {g.currentWeight || '?'} → {g.targetWeight || g.targetValue}
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-sm text-red-400">{error}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Results */
                  <div className="space-y-4">
                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <p className="text-green-400 font-medium flex items-center gap-2">
                        <Check className="w-5 h-5" />
                        {result.createdWorkouts?.length} workouts created
                      </p>
                      {result.usage && (
                        <p className="text-xs text-iron-500 mt-1">
                          {result.usage.tokens} tokens · {result.usage.responseMs}ms · {result.usage.cost}
                        </p>
                      )}
                    </div>

                    {/* Coaching Notes — scrollable */}
                    {result.coachingNotes && (
                      <div className="bg-iron-800/50 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 p-3 border-b border-iron-700/50">
                          <Brain className="w-4 h-4 text-flame-400" />
                          <h3 className="text-sm font-medium text-iron-200">AI Coaching Notes</h3>
                        </div>
                        <div className="p-3 max-h-32 overflow-y-auto">
                          <p className="text-sm text-iron-400 leading-relaxed">{result.coachingNotes}</p>
                        </div>
                      </div>
                    )}

                    {/* Base exercises */}
                    <div className="p-4 bg-iron-800/50 rounded-lg">
                      <h3 className="font-medium text-iron-100 mb-2">{result.workoutName}</h3>
                      <div className="space-y-1">
                        {result.baseExercises?.map((ex, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-iron-400">
                            <Dumbbell className="w-4 h-4" />
                            <span>{ex.name}</span>
                            <span className="text-iron-600">{ex.defaultSets}×{ex.defaultReps}</span>
                            {ex.type && ex.type !== 'weight' && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                ex.type === 'time' ? 'bg-blue-500/20 text-blue-400' : 
                                ex.type === 'bodyweight' ? 'bg-emerald-500/20 text-emerald-400' : ''
                              }`}>{ex.type === 'time' ? 'Time' : 'BW'}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Athlete workouts with personal notes */}
                    <div className="space-y-3 max-h-[250px] overflow-y-auto">
                      {Object.entries(result.athleteWorkouts || {}).map(([id, aw]) => (
                        <div key={id} className="p-3 bg-iron-800/30 rounded-lg">
                          <h4 className="font-medium text-iron-200">{aw.athleteName}</h4>
                          {aw.personalNotes && (
                            <p className="text-xs text-iron-500 mt-1 leading-relaxed">{aw.personalNotes}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {aw.exercises?.slice(0, 4).map((ex, i) => (
                              <span key={i} className={`text-xs px-2 py-0.5 rounded ${
                                ex.substitution ? 'bg-amber-500/20 text-amber-400' : 'bg-iron-700 text-iron-400'
                              }`}>
                                {ex.substitution?.replacement || ex.name}: {
                                  ex.type === 'time' 
                                    ? `${ex.sets?.[0]?.prescribedTime || '?'}s` 
                                    : ex.type === 'bodyweight'
                                      ? `${ex.sets?.[0]?.prescribedReps || '?'} reps`
                                      : `${ex.sets?.[0]?.prescribedWeight || '?'}lb`
                                }
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-iron-800 flex gap-3">
            {!result ? (
              <>
                <button onClick={handleClose} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={handleGenerate}
                  disabled={loading || loadingContext || selectedAthletes.length === 0 || (!isAdmin && (userProfile?.credits ?? 0) < (model === 'premium' ? PREMIUM_CREDIT_COST : CREDIT_COSTS['generate-group-workout'] * selectedAthletes.length))}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Generating...</>
                  ) : (
                    <><Sparkles className="w-5 h-5" />Generate for {selectedAthletes.length} <span className="text-xs opacity-70">({model === 'premium' ? PREMIUM_CREDIT_COST : CREDIT_COSTS['generate-group-workout'] * selectedAthletes.length} cr)</span></>
                  )}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setResult(null); setThinkingMessages([]); }} className="btn-secondary flex-1">
                  Generate Another
                </button>
                <button onClick={handleDone} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  <Check className="w-5 h-5" />Done
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}