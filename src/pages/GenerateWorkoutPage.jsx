import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  Dumbbell,
  Target,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Check,
  RefreshCw,
  Activity,
  Calendar,
  Brain,
  Lock,
  Zap,
  Users,
  MessageSquare,
  Timer,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { workoutService, creditService, CREDIT_COSTS, programService } from '../services/firestore';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../services/firebase';

// Thinking messages that rotate during AI generation
const THINKING_MESSAGES = [
  { text: 'Reviewing your recent training sessions...', icon: 'brain' },
  { text: 'Analyzing strength progression trends...', icon: 'calc' },
  { text: 'Checking for pain history and injury risks...', icon: 'alert' },
  { text: 'Calculating working weights from your e1RM data...', icon: 'calc' },
  { text: 'Evaluating RPE patterns and recovery state...', icon: 'brain' },
  { text: 'Selecting exercises based on your focus area...', icon: 'dumbbell' },
  { text: 'Applying progressive overload to target weights...', icon: 'calc' },
  { text: 'Balancing volume with recovery capacity...', icon: 'brain' },
  { text: 'Building optimal set and rep schemes...', icon: 'dumbbell' },
  { text: 'Writing personalized coaching notes...', icon: 'msg' },
];

export default function GenerateWorkoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userProfile, updateProfile, isAppAdmin } = useAuth();
  
  // Parse program context from URL if coming from a program
  const [programContext] = useState(() => {
    try {
      const ctx = searchParams.get('programContext')
      return ctx ? JSON.parse(ctx) : null
    } catch { return null }
  });
  
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);
  const [generatedWorkout, setGeneratedWorkout] = useState(null);
  const [usageInfo, setUsageInfo] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  
  const [analysisSteps, setAnalysisSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(null);
  
  // AI thinking state
  const [thinkingMessages, setThinkingMessages] = useState([]);
  const thinkingRef = useRef(null);
  const thinkingIntervalRef = useRef(null);
  
  const [userContext, setUserContext] = useState({
    recentWorkouts: [], goals: [], maxLifts: {}, painHistory: {}, rpeAverages: {}, cardioHistory: [],
  });
  
  const [prompt, setPrompt] = useState(() => {
    if (!programContext) return ''
    const parts = [`Program: ${programContext.programName} — Week ${programContext.weekNumber} (${programContext.phase})`]
    parts.push(`Day: ${programContext.dayLabel} (${programContext.dayType})`)
    parts.push(`Primary: ${programContext.primaryLift} ${programContext.primaryScheme} @ ${programContext.intensity}`)
    if (programContext.accessories?.length > 0) {
      parts.push(`Accessories: ${programContext.accessories.join(', ')}`)
    }
    if (programContext.notes) {
      parts.push(`Notes: ${programContext.notes}`)
    }
    parts.push('\nGenerate this workout following the program prescription above. Use my actual performance data to calculate working weights.')
    return parts.join('\n')
  });
  const [workoutFocus, setWorkoutFocus] = useState(programContext ? 'bench' : 'auto');
  const [intensity, setIntensity] = useState(
    programContext?.dayType === 'deload' ? 'recovery' :
    programContext?.dayType === 'test' ? 'max' :
    programContext?.dayType === 'speed' ? 'light' : 'moderate'
  );
  const [model, setModel] = useState('standard');
  const [workoutDate, setWorkoutDate] = useState(() => {
    const dateParam = searchParams.get('date')
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return dateParam
    return new Date().toISOString().split('T')[0]
  });
  
  const isAdmin = isAppAdmin;
  
  useEffect(() => {
    if (user) loadUserContext();
  }, [user]);

  // Auto-scroll thinking messages
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinkingMessages]);

  useEffect(() => {
    return () => {
      if (thinkingIntervalRef.current) clearInterval(thinkingIntervalRef.current);
    };
  }, []);
  
  const addAnalysisStep = (label, status, detail = null) => {
    setAnalysisSteps(prev => {
      const existing = prev.findIndex(s => s.label === label);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { label, status, detail };
        return updated;
      }
      return [...prev, { label, status, detail }];
    });
    setCurrentStep(label);
  };

  const startThinkingAnimation = () => {
    setThinkingMessages([]);
    let index = 0;
    setThinkingMessages([{ ...THINKING_MESSAGES[0], id: 0 }]);
    index = 1;
    
    thinkingIntervalRef.current = setInterval(() => {
      if (index < THINKING_MESSAGES.length) {
        setThinkingMessages(prev => [...prev, { ...THINKING_MESSAGES[index], id: index }]);
        index++;
      } else {
        setThinkingMessages(prev => [...prev, { 
          text: 'Finalizing your workout...', icon: 'brain', id: prev.length 
        }]);
      }
    }, 2000);
  };

  const stopThinkingAnimation = () => {
    if (thinkingIntervalRef.current) {
      clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
  };

  const getThinkingIcon = (icon) => {
    switch (icon) {
      case 'brain': return <Brain className="w-3 h-3 text-flame-400" />;
      case 'alert': return <AlertTriangle className="w-3 h-3 text-amber-400" />;
      case 'calc': return <Sparkles className="w-3 h-3 text-purple-400" />;
      case 'dumbbell': return <Dumbbell className="w-3 h-3 text-cyan-400" />;
      case 'msg': return <MessageSquare className="w-3 h-3 text-blue-400" />;
      case 'check': return <Check className="w-3 h-3 text-green-400" />;
      case 'error': return <AlertTriangle className="w-3 h-3 text-red-400" />;
      default: return <Loader2 className="w-3 h-3 text-flame-400 animate-spin" />;
    }
  };
  
  const loadUserContext = async () => {
    try {
      setLoadingContext(true);
      setAnalysisSteps([]);
      
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      let allWorkouts = [];
      
      addAnalysisStep('Loading workout history', 'loading');
      try {
        const snap = await getDocs(query(
          collection(db, 'workouts'), where('userId', '==', user.uid), limit(50)
        ));
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.status === 'completed') {
            const workoutDate = d.date?.toDate?.() || new Date(d.date);
            allWorkouts.push({
              ...d, date: workoutDate.toISOString().split('T')[0],
              dayOfWeek: dayNames[workoutDate.getDay()],
            });
          }
        });
      } catch (e) { console.error(e); }
      
      try {
        const snap = await getDocs(query(
          collection(db, 'groupWorkouts'), where('assignedTo', '==', user.uid), limit(50)
        ));
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.status === 'completed') {
            const workoutDate = d.date?.toDate?.() || new Date(d.date);
            allWorkouts.push({
              ...d, date: workoutDate.toISOString().split('T')[0],
              dayOfWeek: dayNames[workoutDate.getDay()],
            });
          }
        });
      } catch (e) { console.error(e); }
      
      allWorkouts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      allWorkouts = allWorkouts.slice(0, 20);
      
      addAnalysisStep('Loading workout history', 'complete', `${allWorkouts.length} workouts found`);
      
      addAnalysisStep('Analyzing max lifts', 'loading');
      const maxLifts = {};
      const painHistory = {};
      const rpeData = {};
      const now = new Date();
      
      allWorkouts.forEach(w => {
        const workoutDate = w.date?.toDate ? w.date.toDate() : w.date ? new Date(w.date) : null;
        const daysSince = workoutDate && !isNaN(workoutDate.getTime()) ? Math.floor((now - workoutDate) / (1000 * 60 * 60 * 24)) : null;
        (w.exercises || []).forEach(ex => {
          if (!ex.name) return;
          (ex.sets || []).forEach(s => {
            const weight = parseFloat(s.actualWeight) || parseFloat(s.prescribedWeight) || 0;
            const reps = parseInt(s.actualReps) || parseInt(s.prescribedReps) || 0;
            const rpe = parseInt(s.rpe) || 0;
            const pain = parseInt(s.painLevel) || 0;

            // Skip sets with only prescribed data (not actually performed)
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
      
      const liftCount = Object.keys(maxLifts).length;
      const topLifts = Object.entries(maxLifts)
        .sort((a, b) => b[1].e1rm - a[1].e1rm)
        .slice(0, 3)
        .map(([n, d]) => `${n}: ${d.e1rm}lb`);
      addAnalysisStep('Analyzing max lifts', 'complete', 
        liftCount > 0 ? `${liftCount} lifts tracked. Top: ${topLifts.join(', ')}` : 'No lift data found'
      );
      
      addAnalysisStep('Checking pain history', 'loading');
      const painCount = Object.keys(painHistory).length;
      const painExercises = Object.keys(painHistory).slice(0, 3).join(', ');
      addAnalysisStep('Checking pain history', painCount > 0 ? 'warning' : 'complete',
        painCount > 0 ? `Pain flagged on: ${painExercises}` : 'No pain history'
      );
      
      addAnalysisStep('Analyzing RPE patterns', 'loading');
      const rpeAverages = {};
      Object.entries(rpeData).forEach(([n, d]) => {
        rpeAverages[n] = Math.round(d.total / d.count * 10) / 10;
      });
      const avgRpe = Object.values(rpeAverages).length > 0 
        ? (Object.values(rpeAverages).reduce((a, b) => a + b, 0) / Object.values(rpeAverages).length).toFixed(1)
        : null;
      addAnalysisStep('Analyzing RPE patterns', 'complete',
        avgRpe ? `Average RPE: ${avgRpe}` : 'No RPE data'
      );
      
      addAnalysisStep('Loading goals', 'loading');
      let goals = [];
      try {
        const snap = await getDocs(query(
          collection(db, 'goals'), where('userId', '==', user.uid), limit(10)
        ));
        goals = snap.docs.map(d => d.data()).filter(g => g.status === 'active');
      } catch (e) { console.error(e); }
      addAnalysisStep('Loading goals', 'complete',
        goals.length > 0 ? `${goals.length} active goals` : 'No active goals'
      );
      
      addAnalysisStep('Loading cardio history', 'loading');
      let cardioHistory = [];
      try {
        const cardioSnap = await getDocs(query(
          collection(db, 'workouts'), where('userId', '==', user.uid),
          where('workoutType', '==', 'cardio'), limit(20)
        ));
        cardioHistory = cardioSnap.docs.map(d => {
          const data = d.data();
          return { ...data, date: data.date?.toDate?.()?.toISOString?.().split('T')[0] || data.date };
        });
        cardioHistory.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        cardioHistory = cardioHistory.slice(0, 10);
      } catch (e) { console.error(e); }
      addAnalysisStep('Loading cardio history', 'complete',
        cardioHistory.length > 0 ? `${cardioHistory.length} recent cardio sessions` : 'No cardio data'
      );
      
      setUserContext({ recentWorkouts: allWorkouts, goals, maxLifts, painHistory, rpeAverages, cardioHistory });
      setCurrentStep(null);
      
    } catch (err) {
      console.error('Error loading context:', err);
    } finally {
      setLoadingContext(false);
    }
  };
  
  const handleGenerate = async () => {
    // Check credits (admin bypasses)
    const credits = userProfile?.credits ?? 0;
    const cost = CREDIT_COSTS['generate-workout'];
    if (!isAdmin && credits < cost) {
      setError(`Not enough credits. You need ${cost} credits but have ${credits}. Check Settings for your usage.`);
      return;
    }

    setLoading(true);
    setError(null);
    addAnalysisStep('Generating workout', 'loading');
    startThinkingAnimation();
    
    try {
      // Deduct credits upfront (admin bypasses)
      if (!isAdmin) {
        await creditService.deduct(user.uid, 'generate-workout');
        updateProfile({ credits: credits - cost });
      }

      const response = await fetch('/.netlify/functions/generate-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid, prompt, workoutFocus, intensity,
          model: isAdmin ? model : 'standard',
          draftMode: true,
          context: {
            recentWorkouts: userContext.recentWorkouts.slice(0, 10),
            goals: userContext.goals, maxLifts: userContext.maxLifts,
            painHistory: userContext.painHistory, rpeAverages: userContext.rpeAverages,
            cardioHistory: userContext.cardioHistory,
          },
        }),
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate workout');
      }
      
      const data = await response.json();
      setGeneratedWorkout(data.workout);
      setUsageInfo(data.usage);
      stopThinkingAnimation();
      setThinkingMessages(prev => [...prev, { 
        text: 'Workout ready!', icon: 'check', id: prev.length 
      }]);
      addAnalysisStep('Generating workout', 'complete', `Created in ${data.usage?.responseMs}ms`);
      
    } catch (err) {
      console.error('Generation error:', err);
      setError(err.message);
      // Refund credits on failure
      if (!isAdmin) {
        await creditService.add(user.uid, cost).catch(() => {});
        updateProfile({ credits });
      }
      stopThinkingAnimation();
      setThinkingMessages(prev => [...prev, { 
        text: `Error: ${err.message}`, icon: 'error', id: prev.length 
      }]);
      addAnalysisStep('Generating workout', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddWorkout = async () => {
    if (!generatedWorkout) return;
    setSaving(true);
    try {
      const workoutData = {
        ...generatedWorkout,
        date: new Date(workoutDate + 'T12:00:00'),
        status: 'scheduled',
      }
      
      // Tag workout with program info if from a program
      if (programContext) {
        workoutData.programId = programContext.programId
        workoutData.programWeek = programContext.weekNumber
        workoutData.programDayLabel = programContext.dayLabel
      }
      
      const result = await workoutService.create(user.uid, workoutData);
      
      // Mark program day as completed
      if (programContext?.programId && programContext?.dayKey) {
        try {
          const prog = await programService.get(programContext.programId)
          if (prog) {
            const completedDays = [...(prog.completedDays || []), programContext.dayKey]
            await programService.update(programContext.programId, { completedDays })
          }
        } catch (err) {
          console.error('Failed to mark program day complete:', err)
        }
      }
      
      navigate(`/workouts/${result.id}`);
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save workout');
    } finally {
      setSaving(false);
    }
  };

  // Editing helpers
  const updateExerciseName = (exIdx, name) => {
    setGeneratedWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => i === exIdx ? { ...ex, name } : ex)
    }));
  };
  
  const updateSet = (exIdx, setIdx, field, value) => {
    setGeneratedWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => i === exIdx ? {
        ...ex,
        sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: value } : s)
      } : ex)
    }));
  };
  
  const removeExercise = (exIdx) => {
    setGeneratedWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== exIdx)
    }));
  };
  
  const addSet = (exIdx) => {
    setGeneratedWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => {
        if (i !== exIdx) return ex;
        const lastSet = ex.sets[ex.sets.length - 1] || {};
        return { ...ex, sets: [...ex.sets, { ...lastSet, id: Date.now(), completed: false }] };
      })
    }));
  };
  
  const removeSet = (exIdx, setIdx) => {
    setGeneratedWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) => i === exIdx ? {
        ...ex,
        sets: ex.sets.filter((_, j) => j !== setIdx)
      } : ex)
    }));
  };

  const handleReset = () => {
    setGeneratedWorkout(null);
    setEditing(false);
    setThinkingMessages([]);
    setAnalysisSteps(prev => prev.filter(s => s.label !== 'Generating workout'));
  };

  // Helper to get exercise type display
  const getExerciseTypeTag = (ex) => {
    const type = ex.type || 'weight';
    if (type === 'time') return { label: 'Time', color: 'bg-blue-500/20 text-blue-400' };
    if (type === 'bodyweight') return { label: 'BW', color: 'bg-emerald-500/20 text-emerald-400' };
    return null;
  };

  // Format set display based on exercise type
  const formatSetDisplay = (set, exerciseType) => {
    if (exerciseType === 'time') {
      return `${set.prescribedTime || '?'}s`;
    }
    if (exerciseType === 'bodyweight') {
      return `${set.prescribedReps || '?'} reps`;
    }
    return `${set.prescribedWeight ? `${set.prescribedWeight} lbs × ` : ''}${set.prescribedReps || '?'} reps`;
  };
  
  const focusOptions = [
    { value: 'auto', label: 'Auto' },
    { value: 'push', label: 'Push' },
    { value: 'pull', label: 'Pull' },
    { value: 'legs', label: 'Legs' },
    { value: 'upper', label: 'Upper' },
    { value: 'lower', label: 'Lower' },
    { value: 'full', label: 'Full Body' },
    { value: 'bench', label: 'Bench Focus' },
    { value: 'no-equipment', label: 'No Equipment' },
    { value: 'vacation', label: 'Hotel / Travel' },
  ];
  
  const intensityOptions = [
    { value: 'light', label: 'Light', desc: 'RPE 5-6' },
    { value: 'moderate', label: 'Moderate', desc: 'RPE 7-8' },
    { value: 'heavy', label: 'Heavy', desc: 'RPE 8-9' },
    { value: 'max', label: 'Max', desc: 'RPE 9-10' },
  ];
  
  return (
    <div className="max-w-4xl mx-auto">
      {/* Program context banner */}
      {programContext && (
        <div className="mb-4 p-3 bg-flame-500/10 border border-flame-500/20 rounded-xl flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-flame-500/20 flex items-center justify-center flex-shrink-0">
            <Target className="w-4 h-4 text-flame-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-flame-300">{programContext.programName}</p>
            <p className="text-xs text-iron-400">
              Week {programContext.weekNumber} · {programContext.phase} · {programContext.dayLabel}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
            ({
              primary: 'bg-flame-500/20 text-flame-400 border-flame-500/30',
              volume: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
              speed: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
              deload: 'bg-green-500/20 text-green-400 border-green-500/30',
              test: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
            })[programContext.dayType] || 'bg-iron-800 text-iron-400 border-iron-700'
          }`}>
            {programContext.dayType}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => programContext ? navigate(`/programs/${programContext.programId}`) : navigate('/workouts')}
          className="p-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-display text-2xl text-iron-50">
            {programContext ? 'Generate Program Workout' : 'AI Generate Workout'}
          </h1>
          <p className="text-iron-400 mt-1">
            {programContext 
              ? `${programContext.primaryLift} ${programContext.primaryScheme} @ ${programContext.intensity}`
              : 'Personalized based on your training history'
            }
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Analysis (shows second on mobile, first on desktop) */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <div className="card-steel rounded-xl p-4">
            <button 
              onClick={() => setAnalysisOpen(!analysisOpen)}
              className="flex items-center gap-2 w-full lg:cursor-default"
            >
              <Brain className="w-5 h-5 text-flame-400" />
              <h3 className="font-medium text-iron-200 flex-1 text-left">Analysis</h3>
              {!loadingContext && analysisSteps.length > 0 && (
                <span className="text-xs text-iron-500 lg:hidden">
                  {analysisSteps.filter(s => s.status === 'complete').length}/{analysisSteps.length}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-iron-500 lg:hidden transition-transform ${analysisOpen ? 'rotate-180' : ''}`} />
            </button>
            
            <div className={`${analysisOpen ? '' : 'hidden'} lg:block mt-4`}>
            <div className="space-y-3">
              {analysisSteps.map((step, i) => (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3"
                >
                  <div className="mt-0.5">
                    {step.status === 'loading' ? (
                      <Loader2 className="w-4 h-4 text-flame-400 animate-spin" />
                    ) : step.status === 'complete' ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : step.status === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-iron-200">{step.label}</p>
                    {step.detail && (
                      <p className="text-xs text-iron-500 mt-0.5 truncate">{step.detail}</p>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {analysisSteps.length === 0 && (
                <div className="flex items-center gap-2 text-iron-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Starting analysis...</span>
                </div>
              )}
            </div>

            {/* AI Thinking Stream */}
            {(loading || thinkingMessages.length > 0) && (
              <div className="mt-4 pt-4 border-t border-iron-800">
                <div className="flex items-center gap-2 mb-2">
                  {loading && <Loader2 className="w-3 h-3 text-flame-400 animate-spin" />}
                  <p className="text-xs text-iron-500 uppercase tracking-wider">
                    {loading ? 'AI Thinking...' : 'AI Process'}
                  </p>
                </div>
                <div 
                  ref={thinkingRef}
                  className="max-h-44 overflow-y-auto space-y-1.5"
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
            
            {/* Context Summary */}
            {!loadingContext && !loading && thinkingMessages.length === 0 && (
              <div className="mt-6 pt-4 border-t border-iron-800">
                <p className="text-xs text-iron-500 uppercase tracking-wide mb-3">Summary</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-iron-800/50 rounded-lg p-2">
                    <p className="text-lg font-semibold text-iron-100">{userContext.recentWorkouts.length}</p>
                    <p className="text-xs text-iron-500">Workouts</p>
                  </div>
                  <div className="bg-iron-800/50 rounded-lg p-2">
                    <p className="text-lg font-semibold text-iron-100">{Object.keys(userContext.maxLifts).length}</p>
                    <p className="text-xs text-iron-500">Lifts Tracked</p>
                  </div>
                  <div className="bg-iron-800/50 rounded-lg p-2">
                    <p className="text-lg font-semibold text-iron-100">{userContext.goals.length}</p>
                    <p className="text-xs text-iron-500">Goals</p>
                  </div>
                  <div className={`bg-iron-800/50 rounded-lg p-2 ${Object.keys(userContext.painHistory).length > 0 ? 'border border-amber-500/30' : ''}`}>
                    <p className="text-lg font-semibold text-iron-100">{Object.keys(userContext.painHistory).length}</p>
                    <p className="text-xs text-iron-500">Pain Flags</p>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
        
        {/* Right column - Options & Results (shows first on mobile) */}
        <div className="lg:col-span-2 order-1 lg:order-2">
          {loading ? (
            /* Full-panel AI Thinking Display */
            <div className="space-y-4">
              <div className="bg-iron-800/30 rounded-xl border border-flame-500/20 overflow-hidden">
                <div className="flex items-center gap-2 p-4 border-b border-iron-700/50 bg-flame-500/5">
                  <div className="w-8 h-8 rounded-lg bg-flame-500/20 flex items-center justify-center">
                    <Brain className="w-4 h-4 text-flame-400 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-iron-200">AI is generating your workout...</h3>
                    <p className="text-xs text-iron-500">{workoutFocus !== 'auto' ? workoutFocus : 'Auto'} · {intensity} intensity{prompt ? ` · "${prompt.slice(0, 40)}${prompt.length > 40 ? '...' : ''}"` : ''}</p>
                  </div>
                  <Loader2 className="w-5 h-5 text-flame-400 animate-spin ml-auto" />
                </div>
                <div 
                  ref={thinkingRef}
                  className="p-4 max-h-[400px] overflow-y-auto space-y-2.5 scrollbar-thin"
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
            </div>
          ) : !generatedWorkout ? (
            <div className="card-steel rounded-xl p-6">
              <h3 className="font-medium text-iron-200 mb-4">Workout Options</h3>
              
              <div className="mb-4">
                <label className="block text-sm text-iron-400 mb-2">Describe your workout (optional)</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., 'Heavy bench day with tricep accessories' or 'Similar to last week but more volume'"
                  className="input-field w-full min-h-[80px] resize-none"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm text-iron-400 mb-2">Style</label>
                <div className="flex flex-wrap gap-2">
                  {focusOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setWorkoutFocus(opt.value)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors
                        ${workoutFocus === opt.value
                          ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                          : 'border-iron-700 text-iron-400 hover:border-iron-600'
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm text-iron-400 mb-2">Intensity</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {intensityOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setIntensity(opt.value)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors text-center
                        ${intensity === opt.value
                          ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                          : 'border-iron-700 text-iron-400 hover:border-iron-600'
                        }`}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-xs text-iron-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm text-iron-400 mb-2">Workout Date</label>
                <input
                  type="date"
                  value={workoutDate}
                  onChange={(e) => setWorkoutDate(e.target.value)}
                  className="input-field w-full sm:w-auto"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm text-iron-400 mb-2">AI Model</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setModel('standard')}
                    className={`px-4 py-3 text-sm rounded-lg border transition-colors text-left
                      ${model === 'standard'
                        ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                        : 'border-iron-700 text-iron-400 hover:border-iron-600'
                      }`}
                  >
                    <div className="font-medium flex items-center gap-2"><Zap className="w-4 h-4" />Standard</div>
                    <div className="text-xs text-iron-500 mt-1">GPT-4o-mini · Fast</div>
                  </button>
                  <button
                    onClick={() => isAdmin && setModel('premium')}
                    disabled={!isAdmin}
                    className={`px-4 py-3 text-sm rounded-lg border transition-colors text-left relative
                      ${model === 'premium'
                        ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                        : !isAdmin 
                          ? 'border-iron-800 text-iron-600 cursor-not-allowed opacity-60'
                          : 'border-iron-700 text-iron-400 hover:border-iron-600'
                      }`}
                  >
                    <div className="font-medium flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />Premium
                      {!isAdmin && <Lock className="w-3 h-3" />}
                    </div>
                    <div className="text-xs text-iron-500 mt-1">GPT-4o · Higher quality</div>
                  </button>
                </div>
              </div>
              
              <button
                onClick={handleGenerate}
                disabled={loading || loadingContext || (!isAdmin && (userProfile?.credits ?? 0) < CREDIT_COSTS['generate-workout'])}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Generating...</>
                ) : (
                  <><Sparkles className="w-5 h-5" />Generate Workout<span className="text-xs opacity-70 ml-1">({CREDIT_COSTS['generate-workout']} credits)</span></>
                )}
              </button>
              
              {error && (
                <p className="text-red-400 text-sm mt-3 text-center">{error}</p>
              )}
            </div>
          ) : (
            /* Generated Workout Preview (Draft) */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-steel rounded-xl overflow-hidden"
            >
              <div className="p-6 border-b border-iron-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">Draft</span>
                    </div>
                    {editing ? (
                      <input
                        type="text"
                        value={generatedWorkout.name}
                        onChange={(e) => setGeneratedWorkout(prev => ({ ...prev, name: e.target.value }))}
                        className="input-field w-full text-xl font-semibold"
                      />
                    ) : (
                      <h2 className="text-xl font-semibold text-iron-100">{generatedWorkout.name}</h2>
                    )}
                    {generatedWorkout.description && !editing && (
                      <p className="text-iron-400 mt-1">{generatedWorkout.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setEditing(!editing)} 
                      className={`p-2 rounded-xl transition-colors ${editing ? 'text-flame-400 bg-flame-500/10' : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800'}`}
                      title={editing ? 'Done editing' : 'Edit workout'}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={handleReset} className="p-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-xl" title="Start over">
                      <RefreshCw className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                {usageInfo && (
                  <p className="text-xs text-iron-600 mt-2">
                    {usageInfo.tokens} tokens · {usageInfo.responseMs}ms · {usageInfo.cost}
                  </p>
                )}
              </div>
              
              {/* Coaching notes */}
              {generatedWorkout.notes && !editing && (
                <div className="border-b border-iron-800">
                  <div className="flex items-center gap-2 px-6 pt-3">
                    <Brain className="w-4 h-4 text-flame-400" />
                    <span className="text-xs text-iron-500 uppercase tracking-wider">Coaching Notes</span>
                  </div>
                  <div className="px-6 py-3 max-h-32 overflow-y-auto">
                    <p className="text-sm text-iron-400 leading-relaxed">{generatedWorkout.notes}</p>
                  </div>
                </div>
              )}
              
              {/* Exercises */}
              <div className="divide-y divide-iron-800">
                {generatedWorkout.exercises?.map((ex, i) => {
                  const typeTag = getExerciseTypeTag(ex);
                  const type = ex.type || 'weight';
                  return (
                    <div key={i} className="p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-iron-800 flex items-center justify-center text-iron-400 text-sm font-medium">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          {editing ? (
                            <input
                              type="text"
                              value={ex.name}
                              onChange={(e) => updateExerciseName(i, e.target.value)}
                              className="input-field w-full text-sm font-medium"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-iron-100">{ex.name}</h4>
                              {typeTag && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${typeTag.color}`}>{typeTag.label}</span>
                              )}
                            </div>
                          )}
                          {ex.notes && !editing && <p className="text-xs text-iron-500 mt-0.5">{ex.notes}</p>}
                        </div>
                        {editing && (
                          <button onClick={() => removeExercise(i)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      
                      <div className="ml-11 space-y-1">
                        {ex.sets?.map((set, j) => (
                          <div key={j} className="flex items-center gap-3 text-sm">
                            <span className="text-iron-500 w-12">Set {j + 1}</span>
                            {editing ? (
                              <div className="flex items-center gap-2 flex-1">
                                {type === 'time' ? (
                                  <input type="text" value={set.prescribedTime || ''} onChange={(e) => updateSet(i, j, 'prescribedTime', e.target.value)} className="input-field w-20 text-sm py-1" placeholder="sec" />
                                ) : type === 'bodyweight' ? (
                                  <input type="text" value={set.prescribedReps || ''} onChange={(e) => updateSet(i, j, 'prescribedReps', e.target.value)} className="input-field w-20 text-sm py-1" placeholder="reps" />
                                ) : (
                                  <>
                                    <input type="text" value={set.prescribedWeight || ''} onChange={(e) => updateSet(i, j, 'prescribedWeight', e.target.value)} className="input-field w-20 text-sm py-1" placeholder="lbs" />
                                    <span className="text-iron-500">×</span>
                                    <input type="text" value={set.prescribedReps || ''} onChange={(e) => updateSet(i, j, 'prescribedReps', e.target.value)} className="input-field w-20 text-sm py-1" placeholder="reps" />
                                  </>
                                )}
                                <button onClick={() => removeSet(i, j)} className="p-1 text-iron-600 hover:text-red-400">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="text-iron-300">{formatSetDisplay(set, type)}</span>
                                {set.targetRpe && (
                                  <span className="text-iron-500">@ RPE {set.targetRpe}</span>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                        {editing && (
                          <button onClick={() => addSet(i)} className="text-xs text-flame-400 hover:text-flame-300 mt-1 flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Add set
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Actions */}
              <div className="p-4 border-t border-iron-800 flex gap-3">
                <button onClick={handleReset} className="btn-secondary flex-1">Regenerate</button>
                <button 
                  onClick={handleAddWorkout} 
                  disabled={saving}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Saving...</>
                  ) : (
                    <><Plus className="w-5 h-5" />Add to Workouts</>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}