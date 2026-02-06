import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { workoutService, goalService } from '../services/firestore';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function GenerateWorkoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);
  const [generatedWorkout, setGeneratedWorkout] = useState(null);
  const [error, setError] = useState(null);
  
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
  
  // Load user context on mount
  useEffect(() => {
    if (user) {
      loadUserContext();
    }
  }, [user]);
  
  const loadUserContext = async () => {
    try {
      setLoadingContext(true);
      
      // Get recent workouts (last 30 days, up to 20)
      const workoutsSnapshot = await getDocs(
        query(
          collection(db, 'workouts'),
          where('userId', '==', user.uid),
          where('status', '==', 'completed'),
          orderBy('date', 'desc'),
          limit(20)
        )
      );
      
      const recentWorkouts = workoutsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate?.().toISOString().split('T')[0],
      }));
      
      // Also get group workouts
      const groupWorkoutsSnapshot = await getDocs(
        query(
          collection(db, 'groupWorkouts'),
          where('assignedTo', '==', user.uid),
          where('status', '==', 'completed'),
          orderBy('date', 'desc'),
          limit(20)
        )
      );
      
      const groupWorkouts = groupWorkoutsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate?.().toISOString().split('T')[0],
        isGroupWorkout: true,
      }));
      
      const allWorkouts = [...recentWorkouts, ...groupWorkouts]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 20);
      
      // Get active goals
      const goalsSnapshot = await getDocs(
        query(
          collection(db, 'goals'),
          where('userId', '==', user.uid),
          where('status', '==', 'active')
        )
      );
      
      const goals = goalsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      
      // Calculate max lifts, pain history, and RPE averages from workouts
      const maxLifts = {};
      const painHistory = {};
      const rpeData = {};
      
      allWorkouts.forEach(workout => {
        (workout.exercises || []).forEach(exercise => {
          const name = exercise.name;
          
          (exercise.sets || []).forEach(set => {
            const weight = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0;
            const reps = parseInt(set.actualReps) || parseInt(set.prescribedReps) || 0;
            const rpe = parseInt(set.rpe) || 0;
            const pain = parseInt(set.painLevel) || 0;
            
            // Track max lifts (e1RM)
            if (weight > 0 && reps > 0 && reps <= 12) {
              const e1rm = Math.round(weight * (1 + reps / 30));
              if (!maxLifts[name] || e1rm > maxLifts[name].e1rm) {
                maxLifts[name] = { weight, reps, e1rm };
              }
            }
            
            // Track pain history
            if (pain > 0) {
              if (!painHistory[name]) {
                painHistory[name] = { count: 0, maxPain: 0, recentPain: 0 };
              }
              painHistory[name].count++;
              painHistory[name].maxPain = Math.max(painHistory[name].maxPain, pain);
              painHistory[name].recentPain = pain; // Last recorded
            }
            
            // Track RPE averages
            if (rpe > 0) {
              if (!rpeData[name]) {
                rpeData[name] = { total: 0, count: 0 };
              }
              rpeData[name].total += rpe;
              rpeData[name].count++;
            }
          });
        });
      });
      
      // Calculate RPE averages
      const rpeAverages = {};
      Object.entries(rpeData).forEach(([name, data]) => {
        rpeAverages[name] = Math.round(data.total / data.count * 10) / 10;
      });
      
      setUserContext({
        recentWorkouts: allWorkouts,
        goals,
        maxLifts,
        painHistory,
        rpeAverages,
      });
      
    } catch (err) {
      console.error('Error loading user context:', err);
    } finally {
      setLoadingContext(false);
    }
  };
  
  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    
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
        throw new Error('Failed to generate workout');
      }
      
      const data = await response.json();
      setGeneratedWorkout(data.workout);
      
    } catch (err) {
      console.error('Generation error:', err);
      setError(err.message || 'Failed to generate workout');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSaveWorkout = async () => {
    if (!generatedWorkout) return;
    
    try {
      // Format exercises for saving
      const exercises = generatedWorkout.exercises.map((ex, index) => ({
        id: Date.now() + index,
        name: ex.name,
        type: ex.type || 'weight',
        sets: ex.sets.map((set, setIndex) => ({
          id: Date.now() + index * 100 + setIndex,
          prescribedWeight: set.prescribedWeight?.toString() || '',
          prescribedReps: set.prescribedReps?.toString() || '',
          actualWeight: '',
          actualReps: '',
          rpe: '',
          painLevel: 0,
          completed: false,
        })),
        notes: ex.notes || '',
        expanded: true,
      }));
      
      const workoutData = {
        name: generatedWorkout.name,
        description: generatedWorkout.description,
        exercises,
        status: 'scheduled',
        date: new Date(),
        userId: user.uid,
        generatedByAI: true,
        createdAt: new Date(),
      };
      
      const docRef = await workoutService.create(workoutData);
      navigate(`/workouts/${docRef.id}`);
      
    } catch (err) {
      console.error('Error saving workout:', err);
      setError('Failed to save workout');
    }
  };
  
  const focusOptions = [
    { value: 'auto', label: 'Auto (based on history)' },
    { value: 'push', label: 'Push (chest, shoulders, triceps)' },
    { value: 'pull', label: 'Pull (back, biceps)' },
    { value: 'legs', label: 'Legs (quads, hamstrings, glutes)' },
    { value: 'upper', label: 'Upper Body' },
    { value: 'lower', label: 'Lower Body' },
    { value: 'full', label: 'Full Body' },
    { value: 'bench', label: 'Bench Focus' },
  ];
  
  const intensityOptions = [
    { value: 'light', label: 'Light (RPE 5-6)', description: 'Recovery or deload' },
    { value: 'moderate', label: 'Moderate (RPE 7-8)', description: 'Standard training' },
    { value: 'heavy', label: 'Heavy (RPE 8-9)', description: 'Strength focus' },
    { value: 'max', label: 'Max Effort (RPE 9-10)', description: 'Test day' },
  ];
  
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/workouts')}
          className="p-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-plate transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-display text-display-md text-iron-50">AI Generate Workout</h1>
          <p className="text-iron-400 mt-1">
            Create a personalized workout based on your training history
          </p>
        </div>
      </div>
      
      {/* Context Summary */}
      {loadingContext ? (
        <div className="card-steel rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 text-iron-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading your training data...</span>
          </div>
        </div>
      ) : (
        <div className="card-steel rounded-xl p-6 mb-6">
          <h3 className="text-sm font-medium text-iron-300 mb-4">Your Training Context</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-iron-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-iron-400 mb-1">
                <Dumbbell className="w-4 h-4" />
                <span className="text-xs">Recent Workouts</span>
              </div>
              <p className="text-xl font-semibold text-iron-100">
                {userContext.recentWorkouts.length}
              </p>
            </div>
            <div className="bg-iron-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-iron-400 mb-1">
                <Target className="w-4 h-4" />
                <span className="text-xs">Active Goals</span>
              </div>
              <p className="text-xl font-semibold text-iron-100">
                {userContext.goals.length}
              </p>
            </div>
            <div className="bg-iron-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-iron-400 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs">Tracked Lifts</span>
              </div>
              <p className="text-xl font-semibold text-iron-100">
                {Object.keys(userContext.maxLifts).length}
              </p>
            </div>
            <div className="bg-iron-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-iron-400 mb-1">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs">Pain Flags</span>
              </div>
              <p className="text-xl font-semibold text-iron-100">
                {Object.keys(userContext.painHistory).length}
              </p>
            </div>
          </div>
          
          {/* Pain warnings */}
          {Object.keys(userContext.painHistory).length > 0 && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-sm text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Pain logged on: {Object.keys(userContext.painHistory).join(', ')}
              </p>
              <p className="text-xs text-iron-500 mt-1">
                AI will avoid or modify these exercises
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Generation Options */}
      {!generatedWorkout && (
        <div className="card-steel rounded-xl p-6 mb-6">
          <h3 className="text-sm font-medium text-iron-300 mb-4">Workout Options</h3>
          
          {/* Prompt input */}
          <div className="mb-4">
            <label className="block text-sm text-iron-400 mb-2">
              Describe what you want (optional)
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., 'Similar to Monday's heavy day but more volume' or 'Focus on weak points for bench press'"
              className="input-field min-h-[80px] resize-none"
            />
          </div>
          
          {/* Focus selection */}
          <div className="mb-4">
            <label className="block text-sm text-iron-400 mb-2">Workout Focus</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {focusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setWorkoutFocus(option.value)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors
                    ${workoutFocus === option.value
                      ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                      : 'border-iron-700 bg-iron-800/50 text-iron-300 hover:border-iron-600'
                    }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Intensity selection */}
          <div className="mb-4">
            <label className="block text-sm text-iron-400 mb-2">Intensity</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {intensityOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setIntensity(option.value)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left
                    ${intensity === option.value
                      ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                      : 'border-iron-700 bg-iron-800/50 text-iron-300 hover:border-iron-600'
                    }`}
                >
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-iron-500 mt-0.5">{option.description}</div>
                </button>
              ))}
            </div>
          </div>
          
          {/* Advanced options toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-iron-400 hover:text-iron-300 transition-colors mb-4"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Advanced options
          </button>
          
          {showAdvanced && (
            <div className="p-4 bg-iron-800/30 rounded-lg mb-4">
              <p className="text-sm text-iron-500">
                Additional options coming soon: target duration, specific exercises to include/exclude, etc.
              </p>
            </div>
          )}
          
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
      )}
      
      {/* Generated Workout Preview */}
      {generatedWorkout && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-steel rounded-xl overflow-hidden"
        >
          <div className="p-6 border-b border-iron-800">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-iron-100">
                  {generatedWorkout.name}
                </h2>
                {generatedWorkout.description && (
                  <p className="text-iron-400 mt-1">{generatedWorkout.description}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setGeneratedWorkout(null);
                  handleGenerate();
                }}
                className="p-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-plate transition-colors"
                title="Regenerate"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
            
            {generatedWorkout.estimatedDuration && (
              <p className="text-sm text-iron-500 mt-2">
                Estimated duration: {generatedWorkout.estimatedDuration} minutes
              </p>
            )}
          </div>
          
          {/* Exercises */}
          <div className="divide-y divide-iron-800">
            {generatedWorkout.exercises?.map((exercise, index) => (
              <div key={index} className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-plate bg-flame-500/10 flex items-center justify-center">
                    <Dumbbell className="w-4 h-4 text-flame-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-iron-100">{exercise.name}</h4>
                    {exercise.notes && (
                      <p className="text-xs text-iron-500">{exercise.notes}</p>
                    )}
                  </div>
                </div>
                
                <div className="ml-11 space-y-1">
                  {exercise.sets?.map((set, setIndex) => (
                    <div key={setIndex} className="flex items-center gap-4 text-sm">
                      <span className="text-iron-500 w-16">Set {setIndex + 1}</span>
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
                
                {exercise.restSeconds && (
                  <p className="ml-11 text-xs text-iron-500 mt-2">
                    Rest: {exercise.restSeconds}s between sets
                  </p>
                )}
              </div>
            ))}
          </div>
          
          {/* Notes */}
          {generatedWorkout.notes && (
            <div className="p-4 border-t border-iron-800 bg-iron-800/30">
              <p className="text-sm text-iron-400">{generatedWorkout.notes}</p>
            </div>
          )}
          
          {/* Actions */}
          <div className="p-4 border-t border-iron-800 flex gap-3">
            <button
              onClick={() => setGeneratedWorkout(null)}
              className="btn-secondary flex-1"
            >
              Start Over
            </button>
            <button
              onClick={handleSaveWorkout}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Save & Start Workout
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
