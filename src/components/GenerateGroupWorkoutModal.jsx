import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../services/firebase';

export default function GenerateGroupWorkoutModal({ 
  isOpen, 
  onClose, 
  group, 
  athletes,
  coachId,
  onSuccess,
  isAdmin = false,
}) {
  const [prompt, setPrompt] = useState('');
  const [workoutDate, setWorkoutDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [athleteContexts, setAthleteContexts] = useState({});
  const [loadingContext, setLoadingContext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [useAdvancedModel, setUseAdvancedModel] = useState(false);
  const [workoutFocus, setWorkoutFocus] = useState(['auto']);
  
  // Analysis tracking
  const [analysisSteps, setAnalysisSteps] = useState([]);
  const [expandedAthlete, setExpandedAthlete] = useState(null);
  
  const focusOptions = [
    { value: 'auto', label: 'Auto', exclusive: true },
    { value: 'push', label: 'Push' },
    { value: 'pull', label: 'Pull' },
    { value: 'legs', label: 'Legs' },
    { value: 'upper', label: 'Upper' },
    { value: 'lower', label: 'Lower' },
    { value: 'full', label: 'Full Body', exclusive: true },
    { value: 'bench', label: 'Bench' },
    { value: 'arms', label: 'Arms' },
    { value: 'core', label: 'Core' },
  ];
  
  const toggleFocus = (value) => {
    const option = focusOptions.find(o => o.value === value);
    if (option?.exclusive) {
      setWorkoutFocus([value]);
    } else if (workoutFocus.includes('auto') || workoutFocus.includes('full')) {
      setWorkoutFocus([value]);
    } else if (workoutFocus.includes(value)) {
      const newFocus = workoutFocus.filter(v => v !== value);
      setWorkoutFocus(newFocus.length > 0 ? newFocus : ['auto']);
    } else {
      setWorkoutFocus([...workoutFocus, value]);
    }
  };

  useEffect(() => {
    if (isOpen && athletes?.length > 0) {
      setSelectedAthletes(athletes.map(a => a.uid));
      loadAthleteContexts(athletes);
    }
  }, [isOpen, athletes]);

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
        // Only count significant pain (recurring OR severe)
        const significantPain = Object.entries(ctx.painHistory || {}).filter(
          ([_, d]) => d.count >= 2 || d.maxPain >= 3
        );
        let detail = `${liftCount} lifts`;
        if (significantPain.length > 0) detail += `, ${significantPain.length} pain flags`;
        
        addStep(`Analyzing ${name}`, significantPain.length > 0 ? 'warning' : 'complete', detail);
      } catch (err) {
        console.error(`Error for ${athlete.uid}:`, err);
        contexts[athlete.uid] = {
          id: athlete.uid,
          name,
          maxLifts: {},
          painHistory: {},
          rpeAverages: {},
          goals: [],
          recentWorkouts: [],
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
        collection(db, 'workouts'),
        where('userId', '==', athleteId),
        limit(30)
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

    try {
      const snap = await getDocs(query(
        collection(db, 'groupWorkouts'),
        where('assignedTo', '==', athleteId),
        limit(30)
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

    allWorkouts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

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

    const rpeAverages = {};
    Object.entries(rpeData).forEach(([n, d]) => {
      rpeAverages[n] = Math.round(d.total / d.count * 10) / 10;
    });

    let goals = [];
    try {
      const snap = await getDocs(query(
        collection(db, 'goals'),
        where('userId', '==', athleteId),
        limit(10)
      ));
      goals = snap.docs.map(d => d.data()).filter(g => g.status === 'active');
    } catch (e) { console.error(e); }

    return { 
      id: athleteId, 
      maxLifts, 
      painHistory, 
      rpeAverages, 
      goals,
      recentWorkouts: allWorkouts.slice(0, 5),
    };
  };

  const handleGenerate = async () => {
    if (selectedAthletes.length === 0) {
      setError('Select at least one athlete');
      return;
    }

    setLoading(true);
    setError(null);
    
    addStep('Preparing athlete data', 'loading');
    await new Promise(r => setTimeout(r, 200));

    try {
      // Filter pain to only significant patterns for each athlete
      const athleteData = selectedAthletes.map(uid => {
        const ctx = athleteContexts[uid];
        const significantPain = {};
        Object.entries(ctx?.painHistory || {}).forEach(([name, data]) => {
          if (data.count >= 2 || data.maxPain >= 3) {
            significantPain[name] = data;
          }
        });
        
        return {
          id: uid,
          name: ctx?.name || 'Unknown',
          maxLifts: ctx?.maxLifts || {},
          painHistory: significantPain,
          rpeAverages: ctx?.rpeAverages || {},
          goals: ctx?.goals || [],
          recentWorkouts: ctx?.recentWorkouts || [],
        };
      });
      
      addStep('Preparing athlete data', 'complete', `${athleteData.length} athletes`);
      addStep('Sending to AI', 'loading', useAdvancedModel ? 'Using GPT-4o' : 'Using GPT-4o-mini');

      const response = await fetch('/.netlify/functions/generate-group-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId,
          groupId: group.id,
          athletes: athleteData,
          prompt: workoutFocus.includes('auto') ? prompt : `Focus: ${workoutFocus.join(' + ')}. ${prompt}`,
          workoutDate,
          model: useAdvancedModel ? 'premium' : 'standard',
        }),
      });

      addStep('Sending to AI', 'complete');
      addStep('Creating workouts', 'loading');

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate');
      }

      const data = await response.json();
      setResult(data);
      addStep('Creating workouts', 'complete', 
        `${data.createdWorkouts?.length} workouts saved`
      );

    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
      addStep('Creating workouts', 'error', err.message);
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
    setResult(null);
    setError(null);
    setAnalysisSteps([]);
    setUseAdvancedModel(false);
    setWorkoutFocus(['auto']);
    onClose();
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
                  
                  {/* Summary Stats */}
                  {!loadingContext && Object.keys(athleteContexts).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-iron-700">
                      <p className="text-xs text-iron-500 mb-2">Group Summary</p>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-iron-800/50 rounded-lg py-2">
                          <p className="text-lg font-semibold text-iron-100">{selectedAthletes.length}</p>
                          <p className="text-xs text-iron-500">Athletes</p>
                        </div>
                        <div className="bg-iron-800/50 rounded-lg py-2">
                          <p className="text-lg font-semibold text-iron-100">
                            {Object.values(athleteContexts).filter(c => 
                              Object.entries(c.painHistory || {}).some(([_, d]) => d.count >= 2 || d.maxPain >= 3)
                            ).length}
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
                {!result ? (
                  <div className="space-y-4">
                    {/* Prompt */}
                    <div>
                      <label className="block text-sm text-iron-400 mb-2">Workout description</label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., 'Heavy bench day' or 'Moderate intensity, extra volume'"
                        className="input-field w-full min-h-[80px] resize-none"
                      />
                    </div>
                    
                    {/* Focus - Multi-select */}
                    <div>
                      <label className="block text-sm text-iron-400 mb-2">
                        Focus <span className="text-iron-600">(select multiple)</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {focusOptions.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => toggleFocus(opt.value)}
                            className={`px-2 py-1 text-xs rounded-md border transition-colors
                              ${workoutFocus.includes(opt.value)
                                ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                                : 'border-iron-700 text-iron-400 hover:border-iron-600'
                              }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Date */}
                    <div>
                      <label className="block text-sm text-iron-400 mb-2">
                        <Calendar className="w-4 h-4 inline mr-1" />Date
                      </label>
                      <input
                        type="date"
                        value={workoutDate}
                        onChange={(e) => setWorkoutDate(e.target.value)}
                        className="input-field w-full"
                      />
                    </div>
                    
                    {/* Admin: Model Selection */}
                    {isAdmin && (
                      <div className="p-3 bg-iron-800/50 rounded-lg border border-iron-700">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-iron-200">Advanced Model</p>
                            <p className="text-xs text-iron-500">GPT-4o for better results</p>
                          </div>
                          <button
                            onClick={() => setUseAdvancedModel(!useAdvancedModel)}
                            className={`w-12 h-6 rounded-full transition-colors relative
                              ${useAdvancedModel ? 'bg-flame-500' : 'bg-iron-700'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                              ${useAdvancedModel ? 'translate-x-7' : 'translate-x-1'}`} 
                            />
                          </button>
                        </div>
                      </div>
                    )}

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
                          // Only count significant pain
                          const significantPain = Object.entries(ctx?.painHistory || {}).filter(
                            ([_, d]) => d.count >= 2 || d.maxPain >= 3
                          );
                          const hasPain = significantPain.length > 0;
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
                                  <img src={a.photoURL} className="w-6 h-6 rounded-full" />
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
                              
                              {/* Expanded details */}
                              <AnimatePresence>
                                {isExpanded && ctx && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-t border-iron-700 bg-iron-800/30"
                                  >
                                    <div className="p-3 text-xs space-y-2">
                                      {/* Top lifts */}
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
                                      
                                      {/* Pain - only show significant */}
                                      {(() => {
                                        const sigPain = Object.entries(ctx.painHistory || {}).filter(
                                          ([_, d]) => d.count >= 2 || d.maxPain >= 3
                                        );
                                        return sigPain.length > 0 ? (
                                          <div>
                                            <p className="text-amber-400 mb-1">Significant Pain</p>
                                            <div className="flex flex-wrap gap-1">
                                              {sigPain.map(([name, data]) => (
                                                <span key={name} className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
                                                  {name}: {data.maxPain}/10 ({data.count}x)
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null;
                                      })()}
                                      
                                      {/* Goals */}
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
                          {result.usage.tokens} tokens • {result.usage.responseMs}ms • {result.usage.cost}
                        </p>
                      )}
                    </div>

                    {result.coachingNotes && (
                      <div className="p-4 bg-iron-800/50 rounded-lg">
                        <h3 className="text-sm font-medium text-iron-200 mb-2">Coaching Notes</h3>
                        <p className="text-sm text-iron-400">{result.coachingNotes}</p>
                      </div>
                    )}

                    <div className="p-4 bg-iron-800/50 rounded-lg">
                      <h3 className="font-medium text-iron-100 mb-2">{result.workoutName}</h3>
                      <div className="space-y-1">
                        {result.baseExercises?.map((ex, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-iron-400">
                            <Dumbbell className="w-4 h-4" />
                            <span>{ex.name}</span>
                            <span className="text-iron-600">{ex.defaultSets}×{ex.defaultReps}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[200px] overflow-y-auto">
                      {Object.entries(result.athleteWorkouts || {}).map(([id, aw]) => (
                        <div key={id} className="p-3 bg-iron-800/30 rounded-lg">
                          <h4 className="font-medium text-iron-200">{aw.athleteName}</h4>
                          {aw.personalNotes && (
                            <p className="text-xs text-iron-500 mt-1">{aw.personalNotes}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {aw.exercises?.slice(0, 4).map((ex, i) => (
                              <span key={i} className={`text-xs px-2 py-0.5 rounded ${ex.substitution ? 'bg-amber-500/20 text-amber-400' : 'bg-iron-700 text-iron-400'}`}>
                                {ex.substitution?.replacement || ex.name}: {ex.sets?.[0]?.prescribedWeight}lb
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
                  disabled={loading || loadingContext || selectedAthletes.length === 0}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Generating...</>
                  ) : (
                    <><Sparkles className="w-5 h-5" />Generate for {selectedAthletes.length}</>
                  )}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setResult(null)} className="btn-secondary flex-1">
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