import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../services/firebase';

export default function GenerateWorkoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);
  const [generatedWorkout, setGeneratedWorkout] = useState(null);
  const [usageInfo, setUsageInfo] = useState(null);
  const [error, setError] = useState(null);
  
  // Analysis steps for "AI thinking" display
  const [analysisSteps, setAnalysisSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(null);
  
  // User context for AI
  const [userContext, setUserContext] = useState({
    recentWorkouts: [],
    goals: [],
    maxLifts: {},
    painHistory: {},
    rpeAverages: {},
  });
  
  // Generation options
  const [prompt, setPrompt] = useState('');
  const [workoutFocus, setWorkoutFocus] = useState('auto');
  const [intensity, setIntensity] = useState('moderate');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  useEffect(() => {
    if (user) loadUserContext();
  }, [user]);
  
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
  
  const loadUserContext = async () => {
    try {
      setLoadingContext(true);
      setAnalysisSteps([]);
      
      let allWorkouts = [];
      
      // Step 1: Load personal workouts
      addAnalysisStep('Loading workout history', 'loading');
      try {
        const snap = await getDocs(query(
          collection(db, 'workouts'),
          where('userId', '==', user.uid),
          limit(50)
        ));
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.status === 'completed') {
            allWorkouts.push({
              ...d,
              date: d.date?.toDate?.()?.toISOString?.().split('T')[0] || d.date,
            });
          }
        });
      } catch (e) { console.error(e); }
      
      // Step 2: Load group workouts
      try {
        const snap = await getDocs(query(
          collection(db, 'groupWorkouts'),
          where('assignedTo', '==', user.uid),
          limit(50)
        ));
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.status === 'completed') {
            allWorkouts.push({
              ...d,
              date: d.date?.toDate?.()?.toISOString?.().split('T')[0] || d.date,
            });
          }
        });
      } catch (e) { console.error(e); }
      
      // Sort and limit
      allWorkouts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      allWorkouts = allWorkouts.slice(0, 20);
      
      addAnalysisStep('Loading workout history', 'complete', `${allWorkouts.length} workouts found`);
      
      // Step 3: Calculate max lifts
      addAnalysisStep('Analyzing max lifts', 'loading');
      const maxLifts = {};
      const painHistory = {};
      const rpeData = {};
      
      allWorkouts.forEach(w => {
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
      
      const liftCount = Object.keys(maxLifts).length;
      const topLifts = Object.entries(maxLifts)
        .sort((a, b) => b[1].e1rm - a[1].e1rm)
        .slice(0, 3)
        .map(([n, d]) => `${n}: ${d.e1rm}lb`);
      addAnalysisStep('Analyzing max lifts', 'complete', 
        liftCount > 0 ? `${liftCount} lifts tracked. Top: ${topLifts.join(', ')}` : 'No lift data found'
      );
      
      // Step 4: Check pain history
      addAnalysisStep('Checking pain history', 'loading');
      const painCount = Object.keys(painHistory).length;
      const painExercises = Object.keys(painHistory).slice(0, 3).join(', ');
      addAnalysisStep('Checking pain history', painCount > 0 ? 'warning' : 'complete',
        painCount > 0 ? `Pain flagged on: ${painExercises}` : 'No pain history'
      );
      
      // Step 5: Analyze RPE patterns
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
      
      // Step 6: Load goals
      addAnalysisStep('Loading goals', 'loading');
      let goals = [];
      try {
        const snap = await getDocs(query(
          collection(db, 'goals'),
          where('userId', '==', user.uid),
          limit(10)
        ));
        goals = snap.docs.map(d => d.data()).filter(g => g.status === 'active');
      } catch (e) { console.error(e); }
      addAnalysisStep('Loading goals', 'complete',
        goals.length > 0 ? `${goals.length} active goals` : 'No active goals'
      );
      
      setUserContext({
        recentWorkouts: allWorkouts,
        goals,
        maxLifts,
        painHistory,
        rpeAverages,
      });
      
      setCurrentStep(null);
      
    } catch (err) {
      console.error('Error loading context:', err);
    } finally {
      setLoadingContext(false);
    }
  };
  
  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setAnalysisSteps(prev => [...prev, { label: 'Generating workout', status: 'loading' }]);
    
    try {
      const response = await fetch('/.netlify/functions/generate-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          prompt,
          workoutFocus,
          intensity,
          context: {
            recentWorkouts: userContext.recentWorkouts.slice(0, 10),
            goals: userContext.goals,
            maxLifts: userContext.maxLifts,
            painHistory: userContext.painHistory,
            rpeAverages: userContext.rpeAverages,
          },
        }),
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate workout');
      }
      
      const data = await response.json();
      setGeneratedWorkout({ ...data.workout, id: data.workoutId });
      setUsageInfo(data.usage);
      addAnalysisStep('Generating workout', 'complete', `Created in ${data.usage?.responseMs}ms`);
      
    } catch (err) {
      console.error('Generation error:', err);
      setError(err.message);
      addAnalysisStep('Generating workout', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleStartWorkout = () => {
    if (generatedWorkout?.id) {
      navigate(`/workouts/${generatedWorkout.id}`);
    }
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
  ];
  
  const intensityOptions = [
    { value: 'light', label: 'Light', desc: 'RPE 5-6' },
    { value: 'moderate', label: 'Moderate', desc: 'RPE 7-8' },
    { value: 'heavy', label: 'Heavy', desc: 'RPE 8-9' },
    { value: 'max', label: 'Max', desc: 'RPE 9-10' },
  ];
  
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/workouts')}
          className="p-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-display text-2xl text-iron-50">AI Generate Workout</h1>
          <p className="text-iron-400 mt-1">Personalized based on your training history</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Analysis */}
        <div className="lg:col-span-1">
          <div className="card-steel rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-flame-400" />
              <h3 className="font-medium text-iron-200">Analysis</h3>
            </div>
            
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
            
            {/* Context Summary */}
            {!loadingContext && (
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
        
        {/* Right column - Options & Results */}
        <div className="lg:col-span-2">
          {!generatedWorkout ? (
            <div className="card-steel rounded-xl p-6">
              <h3 className="font-medium text-iron-200 mb-4">Workout Options</h3>
              
              {/* Prompt */}
              <div className="mb-4">
                <label className="block text-sm text-iron-400 mb-2">Describe your workout (optional)</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., 'Heavy bench day with tricep accessories' or 'Similar to last week but more volume'"
                  className="input-field w-full min-h-[80px] resize-none"
                />
              </div>
              
              {/* Focus */}
              <div className="mb-4">
                <label className="block text-sm text-iron-400 mb-2">Focus</label>
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
              
              {/* Intensity */}
              <div className="mb-6">
                <label className="block text-sm text-iron-400 mb-2">Intensity</label>
                <div className="grid grid-cols-4 gap-2">
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
              
              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={loading || loadingContext}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Workout
                  </>
                )}
              </button>
              
              {error && (
                <p className="text-red-400 text-sm mt-3 text-center">{error}</p>
              )}
            </div>
          ) : (
            /* Generated Workout Preview */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-steel rounded-xl overflow-hidden"
            >
              <div className="p-6 border-b border-iron-800">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-iron-100">{generatedWorkout.name}</h2>
                    {generatedWorkout.description && (
                      <p className="text-iron-400 mt-1">{generatedWorkout.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setGeneratedWorkout(null);
                      setAnalysisSteps(prev => prev.filter(s => s.label !== 'Generating workout'));
                    }}
                    className="p-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-xl"
                    title="Start over"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
                
                {usageInfo && (
                  <p className="text-xs text-iron-600 mt-2">
                    {usageInfo.tokens} tokens • {usageInfo.responseMs}ms • {usageInfo.cost}
                  </p>
                )}
              </div>
              
              {/* Coaching notes */}
              {generatedWorkout.notes && (
                <div className="px-6 py-4 bg-iron-800/30 border-b border-iron-800">
                  <p className="text-sm text-iron-400">{generatedWorkout.notes}</p>
                </div>
              )}
              
              {/* Exercises */}
              <div className="divide-y divide-iron-800">
                {generatedWorkout.exercises?.map((ex, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-iron-800 flex items-center justify-center text-iron-400 text-sm font-medium">
                        {i + 1}
                      </div>
                      <div>
                        <h4 className="font-medium text-iron-100">{ex.name}</h4>
                        {ex.notes && <p className="text-xs text-iron-500">{ex.notes}</p>}
                      </div>
                    </div>
                    
                    <div className="ml-11 space-y-1">
                      {ex.sets?.map((set, j) => (
                        <div key={j} className="flex items-center gap-4 text-sm">
                          <span className="text-iron-500 w-12">Set {j + 1}</span>
                          <span className="text-iron-300">
                            {set.prescribedWeight && `${set.prescribedWeight} lbs × `}
                            {set.prescribedReps} reps
                          </span>
                          {set.targetRpe && (
                            <span className="text-iron-500">@ RPE {set.targetRpe}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Actions */}
              <div className="p-4 border-t border-iron-800 flex gap-3">
                <button
                  onClick={() => {
                    setGeneratedWorkout(null);
                    setAnalysisSteps(prev => prev.filter(s => s.label !== 'Generating workout'));
                  }}
                  className="btn-secondary flex-1"
                >
                  Regenerate
                </button>
                <button
                  onClick={handleStartWorkout}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Start Workout
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}