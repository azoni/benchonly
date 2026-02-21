import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  Info,
  X,
  ChevronDown,
  ChevronUp,
  Save,
  ArrowLeft,
  Dumbbell,
  AlertCircle,
  Activity,
  Loader2,
  Search,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { workoutService, trainerRequestService } from '../services/firestore';
import CardioForm from '../components/CardioForm';
import { getTodayString, parseLocalDate, toDateString } from '../utils/dateUtils';
import { normalizeRepRange, groupExercisesForDisplay } from '../utils/workoutUtils';
import { useUIStore } from '../store';

const RPE_INFO = {
  title: 'Rate of Perceived Exertion (RPE)',
  description: 'A scale from 1-10 that measures how hard a set feels, based on reps in reserve (RIR).',
  scale: [
    { value: 10, label: 'Max effort', description: 'Could not do any more reps' },
    { value: 9, label: 'Very hard', description: '1 rep left in tank' },
    { value: 8, label: 'Hard', description: '2 reps left in tank' },
    { value: 7, label: 'Challenging', description: '3 reps left in tank' },
    { value: 6, label: 'Moderate', description: '4+ reps left in tank' },
    { value: 5, label: 'Easy', description: 'Warm-up weight' },
  ],
};

const PAIN_LEVELS = [
  { value: 0, label: 'None', color: 'bg-green-500' },
  { value: 1, label: '1', color: 'bg-green-400' },
  { value: 2, label: '2', color: 'bg-lime-400' },
  { value: 3, label: '3', color: 'bg-yellow-400' },
  { value: 4, label: '4', color: 'bg-yellow-500' },
  { value: 5, label: '5', color: 'bg-orange-400' },
  { value: 6, label: '6', color: 'bg-orange-500' },
  { value: 7, label: '7', color: 'bg-red-400' },
  { value: 8, label: '8', color: 'bg-red-500' },
  { value: 9, label: '9', color: 'bg-red-600' },
  { value: 10, label: '10', color: 'bg-red-700' },
];

const COMMON_EXERCISES = [
  'Bench Press',
  'Incline Bench Press',
  'Close Grip Bench',
  'Dumbbell Press',
  'Overhead Press',
  'Squat',
  'Deadlift',
  'Barbell Row',
  'Pull-ups',
  'Tricep Extension',
  'Bicep Curl',
  'Lateral Raise',
];

const TIME_EXERCISES = [
  'Dead Hang',
  'Plank',
  'Wall Sit',
  'L-Sit',
  'Farmers Carry',
  'Static Hold',
];

const BODYWEIGHT_EXERCISES = [
  'Pull-ups',
  'Push-ups',
  'Dips',
  'Chin-ups',
  'Muscle-ups',
  'Bodyweight Squats',
];

export default function NewWorkoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: editId } = useParams(); // For edit mode
  const { user, userProfile, updateProfile } = useAuth();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [rpeModalOpen, setRpeModalOpen] = useState(false);
  const [workoutType, setWorkoutType] = useState('strength'); // 'strength' or 'cardio'
  const [activeAutocomplete, setActiveAutocomplete] = useState(null); // exercise.id or null
  const autocompleteRef = useRef(null);
  const [nextSupersetGroup, setNextSupersetGroup] = useState(1);
  
  // Support admin/trainer creating workout for another user
  const targetUserId = searchParams.get('userId') || user?.uid;
  const isAdminCreating = searchParams.get('userId') && searchParams.get('userId') !== user?.uid;
  const trainerRequestId = searchParams.get('requestId') || null;
  const paramDate = searchParams.get('date') || null;
  const isEditMode = !!editId;

  // Merge default exercises with custom exercises from user profile
  const customExercises = userProfile?.customExercises || {}
  const allWeightExercises = [...COMMON_EXERCISES, ...(customExercises.weight || [])]
  const allBodyweightExercises = [...BODYWEIGHT_EXERCISES, ...(customExercises.bodyweight || [])]
  const allTimeExercises = [...TIME_EXERCISES, ...(customExercises.time || [])]

  const [workout, setWorkout] = useState({
    name: '',
    date: paramDate || getTodayString(),
    notes: '',
    exercises: [createEmptyExercise()],
  });

  // Load existing workout if editing
  useEffect(() => {
    async function loadWorkout() {
      if (!editId || !user) return;
      
      try {
        const existingWorkout = await workoutService.getById(editId);
        if (existingWorkout) {
          // Check if it's a cardio workout - redirect to detail page since we can't edit cardio yet
          if (existingWorkout.workoutType === 'cardio') {
            navigate(`/workouts/${editId}`);
            return;
          }
          
          setWorkout({
            name: existingWorkout.name || '',
            date: toDateString(existingWorkout.date),
            notes: existingWorkout.notes || '',
            exercises: existingWorkout.exercises?.map(ex => ({
              ...ex,
              id: ex.id || Date.now() + Math.random(),
              expanded: true,
              sets: ex.sets?.map(set => ({
                ...set,
                id: set.id || Date.now() + Math.random(),
              })) || [createEmptySet()]
            })) || [createEmptyExercise()],
          });
          // Compute next superset group from loaded exercises
          const maxGroup = existingWorkout.exercises?.reduce((max, ex) =>
            ex.supersetGroup != null ? Math.max(max, ex.supersetGroup) : max, 0) || 0;
          setNextSupersetGroup(maxGroup + 1);
        }
      } catch (error) {
        console.error('Error loading workout:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadWorkout();
  }, [editId, user]);

  function createEmptyExercise(type = 'weight') {
    return {
      id: Date.now(),
      name: '',
      type: type, // 'weight', 'bodyweight', 'time'
      sets: [createEmptySet(type)],
      notes: '',
      expanded: true,
    };
  }

  function createEmptySet(type = 'weight') {
    const base = {
      id: Date.now() + Math.random(),
      rpe: '',
      painLevel: 0,
      completed: false,
    };
    
    if (type === 'time') {
      return {
        ...base,
        prescribedTime: '', // in seconds
        actualTime: '',
      };
    }
    
    return {
      ...base,
      prescribedWeight: type === 'bodyweight' ? '' : '',
      prescribedReps: '',
      actualWeight: type === 'bodyweight' ? '' : '',
      actualReps: '',
    };
  }

  const addExercise = () => {
    setWorkout((prev) => ({
      ...prev,
      exercises: [...prev.exercises, createEmptyExercise()],
    }));
  };

  const addSuperset = () => {
    const group = nextSupersetGroup;
    const exA = { ...createEmptyExercise(), supersetGroup: group };
    const exB = { ...createEmptyExercise(), supersetGroup: group, id: Date.now() + 1 };
    setWorkout(prev => ({
      ...prev,
      exercises: [...prev.exercises, exA, exB],
    }));
    setNextSupersetGroup(g => g + 1);
  };

  const removeExercise = (exerciseId) => {
    setWorkout((prev) => {
      const ex = prev.exercises.find(e => e.id === exerciseId);
      // If part of a superset, remove both exercises in the pair
      if (ex?.supersetGroup != null) {
        return {
          ...prev,
          exercises: prev.exercises.filter(e => e.supersetGroup !== ex.supersetGroup),
        };
      }
      return {
        ...prev,
        exercises: prev.exercises.filter(e => e.id !== exerciseId),
      };
    });
  };

  const updateExercise = (exerciseId, updates) => {
    setWorkout((prev) => ({
      ...prev,
      exercises: prev.exercises.map((e) =>
        e.id === exerciseId ? { ...e, ...updates } : e
      ),
    }));
  };

  const addSet = (exerciseId) => {
    setWorkout((prev) => {
      const exercise = prev.exercises.find(e => e.id === exerciseId);
      const supersetGroup = exercise?.supersetGroup;

      return {
        ...prev,
        exercises: prev.exercises.map((e) => {
          // Add to this exercise or its superset partner
          if (e.id !== exerciseId && (supersetGroup == null || e.supersetGroup !== supersetGroup)) return e;

          const lastSet = e.sets[e.sets.length - 1];
          const type = e.type || 'weight';

          let newSet = {
            id: Date.now() + Math.random(),
            rpe: '',
            painLevel: 0,
            completed: false,
          };

          if (type === 'time') {
            newSet = { ...newSet, prescribedTime: lastSet?.prescribedTime || '', actualTime: '' };
          } else {
            newSet = {
              ...newSet,
              prescribedWeight: lastSet?.prescribedWeight || '',
              prescribedReps: lastSet?.prescribedReps || '',
              actualWeight: '',
              actualReps: '',
            };
          }

          return { ...e, sets: [...e.sets, newSet] };
        }),
      };
    });
  };

  const removeSet = (exerciseId, setId) => {
    setWorkout((prev) => {
      const exercise = prev.exercises.find(e => e.id === exerciseId);
      const supersetGroup = exercise?.supersetGroup;
      const setIndex = exercise?.sets.findIndex(s => s.id === setId);

      return {
        ...prev,
        exercises: prev.exercises.map((e) => {
          if (e.id === exerciseId) {
            return { ...e, sets: e.sets.filter(s => s.id !== setId) };
          }
          // Sync partner: remove the same index
          if (supersetGroup != null && e.supersetGroup === supersetGroup && setIndex >= 0) {
            return { ...e, sets: e.sets.filter((_, i) => i !== setIndex) };
          }
          return e;
        }),
      };
    });
  };

  const updateSet = (exerciseId, setId, updates) => {
    setWorkout((prev) => ({
      ...prev,
      exercises: prev.exercises.map((e) =>
        e.id === exerciseId
          ? {
              ...e,
              sets: e.sets.map((s) =>
                s.id === setId ? { ...s, ...updates } : s
              ),
            }
          : e
      ),
    }));
  };

  // Autocomplete helpers
  const getExerciseList = (type) => {
    if (type === 'time') return allTimeExercises;
    if (type === 'bodyweight') return allBodyweightExercises;
    return allWeightExercises;
  };

  const getFilteredSuggestions = (query, type) => {
    if (!query.trim()) return getExerciseList(type);
    const q = query.toLowerCase();
    return getExerciseList(type).filter(name => name.toLowerCase().includes(q));
  };

  const selectExerciseName = (exerciseId, name) => {
    updateExercise(exerciseId, { name });
    setActiveAutocomplete(null);
  };

  const saveNewExercises = async () => {
    // Check all exercises for names not in any list
    const newByType = { weight: [], bodyweight: [], time: [] };
    for (const ex of workout.exercises) {
      const name = ex.name?.trim();
      if (!name) continue;
      const list = getExerciseList(ex.type || 'weight');
      if (!list.some(n => n.toLowerCase() === name.toLowerCase())) {
        const type = ex.type || 'weight';
        if (!newByType[type].includes(name)) newByType[type].push(name);
      }
    }
    // Merge with existing custom exercises and save
    const existing = userProfile?.customExercises || {};
    const merged = {
      weight: [...new Set([...(existing.weight || []), ...newByType.weight])],
      bodyweight: [...new Set([...(existing.bodyweight || []), ...newByType.bodyweight])],
      time: [...new Set([...(existing.time || []), ...newByType.time])],
    };
    if (newByType.weight.length || newByType.bodyweight.length || newByType.time.length) {
      await updateProfile({ customExercises: merged });
    }
  };

  // Close autocomplete on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target)) {
        setActiveAutocomplete(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // If cardio is selected, render the CardioForm instead
  // (placed after all hooks to avoid hooks ordering violation)
  if (workoutType === 'cardio') {
    return <CardioForm onBack={() => setWorkoutType('strength')} />;
  }

  const handleSave = async () => {
    if (!workout.name.trim()) {
      alert('Please enter a workout name');
      return;
    }

    setSaving(true);
    try {
      // Save any new custom exercises
      await saveNewExercises();

      const workoutData = {
        ...workout,
        date: parseLocalDate(workout.date),
      };

      // Add trainer fields if creating for a trainer request
      if (trainerRequestId) {
        workoutData.trainerRequestId = trainerRequestId;
        workoutData.trainerId = user?.uid;
      }
      
      if (isEditMode) {
        await workoutService.update(editId, workoutData);
      } else {
        const saved = await workoutService.create(targetUserId, workoutData);

        // Link workout back to the trainer request
        if (trainerRequestId && saved?.id) {
          await trainerRequestService.linkWorkout(trainerRequestId, saved.id).catch(console.error);
        }
      }
      navigate(trainerRequestId ? '/trainer' : isAdminCreating ? '/admin' : '/workouts');
    } catch (error) {
      console.error('Error saving workout:', error);
      alert('Failed to save workout');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-flame-500 animate-spin" />
      </div>
    );
  }

  // Helper: render weight/reps/time inputs for one exercise within a superset set
  const renderSupersetInputs = (exercise, set) => {
    const type = exercise.type || 'weight';
    if (type === 'time') {
      return (
        <div className={`grid gap-2 ${isEditMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label className="block text-xs text-iron-500 mb-1">Target (sec)</label>
            <input type="number" inputMode="numeric" value={set.prescribedTime || ''}
              onChange={e => updateSet(exercise.id, set.id, { prescribedTime: e.target.value })}
              placeholder="seconds" className="w-full input-field text-sm py-2 px-3" />
          </div>
          {isEditMode && (
            <div>
              <label className="block text-xs text-flame-400 mb-1">Actual (sec)</label>
              <input type="number" inputMode="numeric" value={set.actualTime || ''}
                onChange={e => updateSet(exercise.id, set.id, { actualTime: e.target.value })}
                placeholder="seconds" className="w-full input-field text-sm py-2 px-3 border-flame-500/30" />
            </div>
          )}
        </div>
      );
    }
    if (type === 'bodyweight') {
      return (
        <div className={`grid gap-2 ${isEditMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label className="block text-xs text-iron-500 mb-1">Target Reps</label>
            <input type="text" inputMode="numeric" value={set.prescribedReps || ''}
              onChange={e => updateSet(exercise.id, set.id, { prescribedReps: e.target.value })}
              onBlur={e => updateSet(exercise.id, set.id, { prescribedReps: normalizeRepRange(e.target.value) })}
              placeholder="e.g. 8 or 6-8" className="w-full input-field text-sm py-2 px-3" />
          </div>
          {isEditMode && (
            <div>
              <label className="block text-xs text-flame-400 mb-1">Actual Reps</label>
              <input type="number" inputMode="numeric" value={set.actualReps || ''}
                onChange={e => updateSet(exercise.id, set.id, { actualReps: e.target.value })}
                placeholder="reps" className="w-full input-field text-sm py-2 px-3 border-flame-500/30" />
            </div>
          )}
        </div>
      );
    }
    // Weight type
    return (
      <div className={`grid gap-2 ${isEditMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="flex gap-1 items-center">
          <input type="text" value={set.prescribedWeight || ''}
            onChange={e => updateSet(exercise.id, set.id, { prescribedWeight: e.target.value })}
            placeholder="lbs" className="w-full input-field text-sm py-2 px-3" />
          <span className="text-iron-600 text-xs">×</span>
          <input type="text" inputMode="numeric" value={set.prescribedReps || ''}
            onChange={e => updateSet(exercise.id, set.id, { prescribedReps: e.target.value })}
            onBlur={e => updateSet(exercise.id, set.id, { prescribedReps: normalizeRepRange(e.target.value) })}
            placeholder="reps" className="w-full input-field text-sm py-2 px-3" />
        </div>
        {isEditMode && (
          <div className="flex gap-1 items-center">
            <input type="text" value={set.actualWeight || ''}
              onChange={e => updateSet(exercise.id, set.id, { actualWeight: e.target.value })}
              placeholder="lbs" className="w-full input-field text-sm py-2 px-3 border-flame-500/30" />
            <span className="text-iron-600 text-xs">×</span>
            <input type="number" inputMode="numeric" value={set.actualReps || ''}
              onChange={e => updateSet(exercise.id, set.id, { actualReps: e.target.value })}
              placeholder="reps" className="w-full input-field text-sm py-2 px-3 border-flame-500/30" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-iron-400 hover:text-iron-100 hover:bg-iron-800 rounded-plate transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-display text-display-md text-iron-50">
            {isEditMode ? 'Edit Workout' : trainerRequestId ? 'Create Trainer Workout' : 'New Workout'}
          </h1>
          <p className="text-iron-400">
            {isEditMode ? 'Update your training session' : trainerRequestId ? `Building for user ${targetUserId.slice(0, 8)}...` : 'Log your training session'}
          </p>
        </div>
      </div>

      {/* Workout Type Toggle - hide in edit mode */}
      {!isEditMode && (
      <div className="card-steel p-2 mb-6 flex gap-2">
        <button
          onClick={() => setWorkoutType('strength')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors ${
            workoutType === 'strength'
              ? 'bg-flame-500 text-white'
              : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800'
          }`}
        >
          <Dumbbell className="w-5 h-5" />
          Strength
        </button>
        <button
          onClick={() => setWorkoutType('cardio')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors ${
            workoutType === 'cardio'
              ? 'bg-flame-500 text-white'
              : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800'
          }`}
        >
          <Activity className="w-5 h-5" />
          Cardio
        </button>
      </div>
      )}

      {/* Workout Info */}
      <div className="card-steel rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-iron-300 mb-2">
              Workout Name
            </label>
            <input
              type="text"
              value={workout.name}
              onChange={(e) => setWorkout((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Bench Day, Upper Body"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-iron-300 mb-2">
              Date
            </label>
            <input
              type="date"
              value={workout.date}
              onChange={(e) => setWorkout((prev) => ({ ...prev, date: e.target.value }))}
              className="input-field"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-iron-300 mb-2">
            Notes (optional)
          </label>
          <textarea
            value={workout.notes}
            onChange={(e) => setWorkout((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="How did you feel? Any observations?"
            rows={2}
            className="input-field resize-none"
          />
        </div>
      </div>

      {/* Exercises */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-iron-100">Exercises</h2>
          {isEditMode && (
          <button
            onClick={() => setRpeModalOpen(true)}
            className="text-sm text-flame-400 hover:text-flame-300 flex items-center gap-1"
          >
            <Info className="w-4 h-4" />
            What is RPE?
          </button>
          )}
        </div>

        <AnimatePresence>
          {groupExercisesForDisplay(workout.exercises).map((group, groupIndex) => {
            // ── Superset Card ──
            if (group.type === 'superset') {
              const { exerciseA, exerciseB } = group;
              const expanded = exerciseA.expanded !== false;
              return (
                <motion.div
                  key={`ss-${group.supersetGroup}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="card-steel rounded-xl overflow-hidden border border-purple-500/20"
                >
                  {/* Superset Header */}
                  <div className="p-4 border-b border-iron-800">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-400 text-xs font-semibold">
                        <Zap className="w-3.5 h-3.5" />
                        Superset
                      </div>
                      <div className="flex-1" />
                      <button
                        onClick={() => {
                          updateExercise(exerciseA.id, { expanded: !expanded });
                          updateExercise(exerciseB.id, { expanded: !expanded });
                        }}
                        className="p-2 text-iron-500 hover:text-iron-300 transition-colors"
                      >
                        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => removeExercise(exerciseA.id)}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Exercise A Name + Type */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-purple-400 bg-purple-500/10 w-5 h-5 rounded flex items-center justify-center">A</span>
                        <div className="flex-1 relative" ref={activeAutocomplete === exerciseA.id ? autocompleteRef : null}>
                          <input
                            type="text"
                            value={exerciseA.name}
                            onChange={(e) => { updateExercise(exerciseA.id, { name: e.target.value }); setActiveAutocomplete(exerciseA.id); }}
                            onFocus={() => setActiveAutocomplete(exerciseA.id)}
                            placeholder="Search exercise A..."
                            className="w-full bg-transparent text-iron-100 font-medium border-none focus:outline-none placeholder:text-iron-500"
                          />
                          {activeAutocomplete === exerciseA.id && (
                            <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-iron-900 border border-iron-700 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                              {(() => {
                                const filtered = getFilteredSuggestions(exerciseA.name, exerciseA.type || 'weight');
                                const query = exerciseA.name?.trim().toLowerCase();
                                const exactMatch = filtered.some(n => n.toLowerCase() === query);
                                return (<>
                                  {filtered.map(name => (
                                    <button key={name} type="button" onMouseDown={e => e.preventDefault()} onClick={() => selectExerciseName(exerciseA.id, name)}
                                      className="w-full text-left px-4 py-3 text-sm text-iron-200 hover:bg-iron-800 active:bg-iron-700 transition-colors border-b border-iron-800/50 last:border-b-0">{name}</button>
                                  ))}
                                  {query && !exactMatch && (
                                    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => selectExerciseName(exerciseA.id, exerciseA.name.trim())}
                                      className="w-full text-left px-4 py-3 text-sm text-flame-400 hover:bg-iron-800 active:bg-iron-700 transition-colors flex items-center gap-2">
                                      <Plus className="w-4 h-4" /> Add &quot;{exerciseA.name.trim()}&quot;
                                    </button>
                                  )}
                                </>);
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-7">
                        {[{ type: 'weight', label: 'Weight' }, { type: 'bodyweight', label: 'Bodyweight' }, { type: 'time', label: 'Time' }].map(({ type, label }) => (
                          <button key={type} onClick={() => updateExercise(exerciseA.id, { type, sets: exerciseA.sets.map(s => ({ ...createEmptySet(type), id: s.id, rpe: s.rpe, painLevel: s.painLevel })) })}
                            className={`px-3 py-1 text-xs rounded-lg transition-colors ${(exerciseA.type || 'weight') === type ? 'bg-flame-500 text-white' : 'bg-iron-800 text-iron-400 hover:text-iron-200'}`}>{label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Exercise B Name + Type */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-purple-400 bg-purple-500/10 w-5 h-5 rounded flex items-center justify-center">B</span>
                        <div className="flex-1 relative" ref={activeAutocomplete === exerciseB.id ? autocompleteRef : null}>
                          <input
                            type="text"
                            value={exerciseB.name}
                            onChange={(e) => { updateExercise(exerciseB.id, { name: e.target.value }); setActiveAutocomplete(exerciseB.id); }}
                            onFocus={() => setActiveAutocomplete(exerciseB.id)}
                            placeholder="Search exercise B..."
                            className="w-full bg-transparent text-iron-100 font-medium border-none focus:outline-none placeholder:text-iron-500"
                          />
                          {activeAutocomplete === exerciseB.id && (
                            <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-iron-900 border border-iron-700 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                              {(() => {
                                const filtered = getFilteredSuggestions(exerciseB.name, exerciseB.type || 'weight');
                                const query = exerciseB.name?.trim().toLowerCase();
                                const exactMatch = filtered.some(n => n.toLowerCase() === query);
                                return (<>
                                  {filtered.map(name => (
                                    <button key={name} type="button" onMouseDown={e => e.preventDefault()} onClick={() => selectExerciseName(exerciseB.id, name)}
                                      className="w-full text-left px-4 py-3 text-sm text-iron-200 hover:bg-iron-800 active:bg-iron-700 transition-colors border-b border-iron-800/50 last:border-b-0">{name}</button>
                                  ))}
                                  {query && !exactMatch && (
                                    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => selectExerciseName(exerciseB.id, exerciseB.name.trim())}
                                      className="w-full text-left px-4 py-3 text-sm text-flame-400 hover:bg-iron-800 active:bg-iron-700 transition-colors flex items-center gap-2">
                                      <Plus className="w-4 h-4" /> Add &quot;{exerciseB.name.trim()}&quot;
                                    </button>
                                  )}
                                </>);
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-7">
                        {[{ type: 'weight', label: 'Weight' }, { type: 'bodyweight', label: 'Bodyweight' }, { type: 'time', label: 'Time' }].map(({ type, label }) => (
                          <button key={type} onClick={() => updateExercise(exerciseB.id, { type, sets: exerciseB.sets.map(s => ({ ...createEmptySet(type), id: s.id, rpe: s.rpe, painLevel: s.painLevel })) })}
                            className={`px-3 py-1 text-xs rounded-lg transition-colors ${(exerciseB.type || 'weight') === type ? 'bg-flame-500 text-white' : 'bg-iron-800 text-iron-400 hover:text-iron-200'}`}>{label}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Superset Sets */}
                  <AnimatePresence>
                    {expanded && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="p-4 space-y-3">
                          {exerciseA.sets.map((setA, setIndex) => {
                            const setB = exerciseB.sets[setIndex];
                            if (!setB) return null;
                            return (
                              <div key={setA.id} className="p-3 bg-iron-800/30 rounded-lg space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-iron-300 font-medium text-sm">Set {setIndex + 1}</span>
                                  {exerciseA.sets.length > 1 && (
                                    <button onClick={() => removeSet(exerciseA.id, setA.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                {/* Exercise A inputs */}
                                <div>
                                  <p className="text-xs text-purple-400 font-medium mb-1.5">A — {exerciseA.name || 'Exercise A'}</p>
                                  {renderSupersetInputs(exerciseA, setA)}
                                </div>
                                {/* Exercise B inputs */}
                                <div className="pt-2 border-t border-iron-700/30">
                                  <p className="text-xs text-purple-400 font-medium mb-1.5">B — {exerciseB.name || 'Exercise B'}</p>
                                  {renderSupersetInputs(exerciseB, setB)}
                                </div>
                                {/* RPE / Pain (edit mode) */}
                                {isEditMode && (
                                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-iron-700/30">
                                    <div>
                                      <label className="block text-xs text-iron-500 mb-1">RPE</label>
                                      <select value={setA.rpe} onChange={(e) => { updateSet(exerciseA.id, setA.id, { rpe: e.target.value }); updateSet(exerciseB.id, setB.id, { rpe: e.target.value }); }}
                                        className="input-field text-sm py-2 px-3 w-full">
                                        <option value="">—</option>
                                        {[5, 6, 7, 8, 9, 10].map(val => <option key={val} value={val}>{val}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs text-iron-500 mb-1">Pain</label>
                                      <select value={setA.painLevel} onChange={(e) => { const v = parseInt(e.target.value); updateSet(exerciseA.id, setA.id, { painLevel: v }); updateSet(exerciseB.id, setB.id, { painLevel: v }); }}
                                        className="input-field text-sm py-2 px-3 w-full">
                                        {PAIN_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <button onClick={() => addSet(exerciseA.id)} className="mt-2 text-sm text-flame-400 hover:text-flame-300 flex items-center gap-1">
                            <Plus className="w-4 h-4" /> Add Set
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            }

            // ── Single Exercise Card ──
            const exercise = group.exercise;
            return (
            <motion.div
              key={exercise.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="card-steel rounded-xl overflow-hidden"
            >
              {/* Exercise Header */}
              <div className="p-4 border-b border-iron-800">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-plate bg-flame-500/10 flex items-center justify-center text-flame-400 font-semibold text-sm">
                    {groupIndex + 1}
                  </div>
                  
                  <div className="flex-1 relative" ref={activeAutocomplete === exercise.id ? autocompleteRef : null}>
                    <input
                      type="text"
                      value={exercise.name}
                      onChange={(e) => {
                        updateExercise(exercise.id, { name: e.target.value });
                        setActiveAutocomplete(exercise.id);
                      }}
                      onFocus={() => setActiveAutocomplete(exercise.id)}
                      placeholder="Search or type exercise..."
                      className="w-full bg-transparent text-iron-100 font-medium
                        border-none focus:outline-none placeholder:text-iron-500"
                    />
                    {/* Autocomplete dropdown */}
                    {activeAutocomplete === exercise.id && (
                      <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-iron-900 border border-iron-700 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                        {(() => {
                          const filtered = getFilteredSuggestions(exercise.name, exercise.type || 'weight');
                          const query = exercise.name?.trim().toLowerCase();
                          const exactMatch = filtered.some(n => n.toLowerCase() === query);
                          return (
                            <>
                              {filtered.length > 0 ? (
                                filtered.map(name => (
                                  <button
                                    key={name}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => selectExerciseName(exercise.id, name)}
                                    className="w-full text-left px-4 py-3 text-sm text-iron-200 hover:bg-iron-800 active:bg-iron-700 transition-colors border-b border-iron-800/50 last:border-b-0"
                                  >
                                    {name}
                                  </button>
                                ))
                              ) : null}
                              {query && !exactMatch && (
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => selectExerciseName(exercise.id, exercise.name.trim())}
                                  className="w-full text-left px-4 py-3 text-sm text-flame-400 hover:bg-iron-800 active:bg-iron-700 transition-colors flex items-center gap-2"
                                >
                                  <Plus className="w-4 h-4" />
                                  Add "{exercise.name.trim()}"
                                </button>
                              )}
                              {!query && filtered.length === 0 && (
                                <p className="px-4 py-3 text-sm text-iron-500">Type to search...</p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => updateExercise(exercise.id, { expanded: !exercise.expanded })}
                    className="p-2 text-iron-500 hover:text-iron-300 transition-colors"
                  >
                    {exercise.expanded ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </button>
                  
                  {workout.exercises.length > 1 && (
                    <button
                      onClick={() => removeExercise(exercise.id)}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {/* Exercise Type Selector */}
                <div className="flex gap-2">
                  {[
                    { type: 'weight', label: 'Weight' },
                    { type: 'bodyweight', label: 'Bodyweight' },
                    { type: 'time', label: 'Time' },
                  ].map(({ type, label }) => (
                    <button
                      key={type}
                      onClick={() => {
                        // Update exercise type and reset sets to match new type
                        updateExercise(exercise.id, { 
                          type,
                          sets: exercise.sets.map(s => ({
                            ...createEmptySet(type),
                            id: s.id,
                            rpe: s.rpe,
                            painLevel: s.painLevel,
                          }))
                        });
                      }}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        (exercise.type || 'weight') === type
                          ? 'bg-flame-500 text-white'
                          : 'bg-iron-800 text-iron-400 hover:text-iron-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sets */}
              <AnimatePresence>
                {exercise.expanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4">
                      {/* Set Headers - Desktop */}
                      <div className={`hidden md:grid gap-2 mb-2 text-xs text-iron-500 uppercase tracking-wider ${isEditMode ? 'grid-cols-12' : 'grid-cols-8'}`}>
                        <div className="col-span-1">Set</div>
                        <div className={isEditMode ? 'col-span-3' : 'col-span-6'}>Target</div>
                        {isEditMode && (
                          <>
                            <div className="col-span-3">Actual</div>
                            <div className="col-span-2">
                              <span className="flex items-center gap-1">
                                RPE
                                <button
                                  onClick={() => setRpeModalOpen(true)}
                                  className="text-flame-400 hover:text-flame-300"
                                >
                                  <Info className="w-3 h-3" />
                                </button>
                              </span>
                            </div>
                            <div className="col-span-2">Pain</div>
                          </>
                        )}
                        <div className="col-span-1"></div>
                      </div>

                      {/* Set Rows */}
                      {exercise.sets.map((set, setIndex) => (
                        <div
                          key={set.id}
                          className="mb-4 md:mb-2"
                        >
                          {/* Mobile Layout */}
                          <div className="md:hidden space-y-3 p-3 bg-iron-800/30 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="text-iron-300 font-medium">Set {setIndex + 1}</span>
                              <button
                                onClick={() => removeSet(exercise.id, set.id)}
                                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            
                            {/* Time-based exercise */}
                            {exercise.type === 'time' ? (
                              <div className={`grid gap-3 ${isEditMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                <div>
                                  <label className="block text-xs text-iron-500 mb-1">Target (sec)</label>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={set.prescribedTime || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        prescribedTime: e.target.value,
                                      })
                                    }
                                    placeholder="seconds"
                                    className="w-full input-field text-base py-3 px-4"
                                  />
                                </div>
                                {isEditMode && (
                                <div>
                                  <label className="block text-xs text-flame-400 mb-1">Actual (sec)</label>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={set.actualTime || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        actualTime: e.target.value,
                                      })
                                    }
                                    placeholder="seconds"
                                    className="w-full input-field text-base py-3 px-4 border-flame-500/30"
                                  />
                                </div>
                                )}
                              </div>
                            ) : exercise.type === 'bodyweight' ? (
                              /* Bodyweight exercise - reps only */
                              <div className={`grid gap-3 ${isEditMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                <div>
                                  <label className="block text-xs text-iron-500 mb-1">Target Reps</label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={set.prescribedReps || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        prescribedReps: e.target.value,
                                      })
                                    }
                                    onBlur={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        prescribedReps: normalizeRepRange(e.target.value),
                                      })
                                    }
                                    placeholder="e.g. 8 or 6-8"
                                    className="w-full input-field text-base py-3 px-4"
                                  />
                                </div>
                                {isEditMode && (
                                <div>
                                  <label className="block text-xs text-flame-400 mb-1">Actual Reps</label>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={set.actualReps || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        actualReps: e.target.value,
                                      })
                                    }
                                    placeholder="reps"
                                    className="w-full input-field text-base py-3 px-4 border-flame-500/30"
                                  />
                                </div>
                                )}
                              </div>
                            ) : (
                              /* Weight exercise - weight + reps */
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-iron-500 mb-1">Target Weight</label>
                                  <input
                                    type="text"
                                    value={set.prescribedWeight || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        prescribedWeight: e.target.value,
                                      })
                                    }
                                    placeholder="lbs"
                                    className="w-full input-field text-base py-3 px-4"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-iron-500 mb-1">Target Reps</label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={set.prescribedReps || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        prescribedReps: e.target.value,
                                      })
                                    }
                                    onBlur={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        prescribedReps: normalizeRepRange(e.target.value),
                                      })
                                    }
                                    placeholder="e.g. 8 or 6-8"
                                    className="w-full input-field text-base py-3 px-4"
                                  />
                                </div>
                                {isEditMode && (
                                <>
                                <div>
                                  <label className="block text-xs text-flame-400 mb-1">Actual Weight</label>
                                  <input
                                    type="text"
                                    value={set.actualWeight || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        actualWeight: e.target.value,
                                      })
                                    }
                                    placeholder="lbs"
                                    className="w-full input-field text-base py-3 px-4 border-flame-500/30"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-flame-400 mb-1">Actual Reps</label>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={set.actualReps || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        actualReps: e.target.value,
                                      })
                                    }
                                    placeholder="reps"
                                    className="w-full input-field text-base py-3 px-4 border-flame-500/30"
                                  />
                                </div>
                                </>
                                )}
                              </div>
                            )}
                            
                            {isEditMode && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-iron-500 mb-1 flex items-center gap-1">
                                  RPE
                                  <button
                                    onClick={() => setRpeModalOpen(true)}
                                    className="text-flame-400"
                                  >
                                    <Info className="w-3 h-3" />
                                  </button>
                                </label>
                                <select
                                  value={set.rpe}
                                  onChange={(e) =>
                                    updateSet(exercise.id, set.id, {
                                      rpe: e.target.value,
                                    })
                                  }
                                  className="input-field text-base py-3 px-4 w-full"
                                >
                                  <option value="">—</option>
                                  {[5, 6, 7, 8, 9, 10].map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-iron-500 mb-1">Pain Level</label>
                                <select
                                  value={set.painLevel}
                                  onChange={(e) =>
                                    updateSet(exercise.id, set.id, {
                                      painLevel: parseInt(e.target.value),
                                    })
                                  }
                                  className="input-field text-base py-3 px-4 w-full"
                                >
                                  {PAIN_LEVELS.map(({ value, label }) => (
                                    <option key={value} value={value}>{label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            )}
                          </div>

                          {/* Desktop Layout */}
                          <div className={`hidden md:grid gap-2 items-center ${isEditMode ? 'grid-cols-12' : 'grid-cols-8'}`}>
                            <div className="col-span-1">
                              <span className="text-iron-400 text-sm font-medium">
                                {setIndex + 1}
                              </span>
                            </div>

                            {exercise.type === 'time' ? (
                              /* Time exercise - single time fields */
                              <>
                                <div className={isEditMode ? 'col-span-3' : 'col-span-6'}>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={set.prescribedTime || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        prescribedTime: e.target.value,
                                      })
                                    }
                                    placeholder="seconds"
                                    className="w-full input-field text-sm py-2 px-3"
                                  />
                                </div>
                                {isEditMode && (
                                <div className="col-span-3">
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={set.actualTime || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        actualTime: e.target.value,
                                      })
                                    }
                                    placeholder="seconds"
                                    className="w-full input-field text-sm py-2 px-3 border-flame-500/30"
                                  />
                                </div>
                                )}
                              </>
                            ) : exercise.type === 'bodyweight' ? (
                              /* Bodyweight exercise - reps only */
                              <>
                                <div className={isEditMode ? 'col-span-3' : 'col-span-6'}>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={set.prescribedReps || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        prescribedReps: e.target.value,
                                      })
                                    }
                                    onBlur={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        prescribedReps: normalizeRepRange(e.target.value),
                                      })
                                    }
                                    placeholder="e.g. 8 or 6-8"
                                    className="w-full input-field text-sm py-2 px-3"
                                  />
                                </div>
                                {isEditMode && (
                                <div className="col-span-3">
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={set.actualReps || ''}
                                    onChange={(e) =>
                                      updateSet(exercise.id, set.id, {
                                        actualReps: e.target.value,
                                      })
                                    }
                                    placeholder="reps"
                                    className="w-full input-field text-sm py-2 px-3 border-flame-500/30"
                                  />
                                </div>
                                )}
                              </>
                            ) : (
                              /* Weight exercise - weight x reps */
                              <>
                                <div className={isEditMode ? 'col-span-3' : 'col-span-6'}>
                                  <div className="flex gap-1 items-center">
                                    <input
                                      type="text"
                                      value={set.prescribedWeight || ''}
                                      onChange={(e) =>
                                        updateSet(exercise.id, set.id, {
                                          prescribedWeight: e.target.value,
                                        })
                                      }
                                      placeholder="lbs"
                                      className="w-full input-field text-sm py-2 px-3"
                                    />
                                    <span className="text-iron-600">×</span>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={set.prescribedReps || ''}
                                      onChange={(e) =>
                                        updateSet(exercise.id, set.id, {
                                          prescribedReps: e.target.value,
                                        })
                                      }
                                      onBlur={(e) =>
                                        updateSet(exercise.id, set.id, {
                                          prescribedReps: normalizeRepRange(e.target.value),
                                        })
                                      }
                                      placeholder="reps"
                                      className="w-full input-field text-sm py-2 px-3"
                                    />
                                  </div>
                                </div>
                                {isEditMode && (
                                <div className="col-span-3">
                                  <div className="flex gap-1 items-center">
                                    <input
                                      type="text"
                                      value={set.actualWeight || ''}
                                      onChange={(e) =>
                                        updateSet(exercise.id, set.id, {
                                          actualWeight: e.target.value,
                                        })
                                      }
                                      placeholder="lbs"
                                      className="w-full input-field text-sm py-2 px-3 border-flame-500/30"
                                    />
                                    <span className="text-iron-600">×</span>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      value={set.actualReps || ''}
                                      onChange={(e) =>
                                        updateSet(exercise.id, set.id, {
                                          actualReps: e.target.value,
                                        })
                                      }
                                      placeholder="reps"
                                      className="w-full input-field text-sm py-2 px-3 border-flame-500/30"
                                    />
                                  </div>
                                </div>
                                )}
                              </>
                            )}

                          {/* RPE - edit mode only */}
                          {isEditMode && (
                          <div className="col-span-2">
                            <select
                              value={set.rpe}
                              onChange={(e) =>
                                updateSet(exercise.id, set.id, {
                                  rpe: e.target.value,
                                })
                              }
                              className="input-field text-sm py-2 px-3 w-full"
                            >
                              <option value="">—</option>
                              {[5, 6, 7, 8, 9, 10].map((val) => (
                                <option key={val} value={val}>
                                  {val}
                                </option>
                              ))}
                            </select>
                          </div>
                          )}

                          {/* Pain Level - edit mode only */}
                          {isEditMode && (
                          <div className="col-span-2">
                            <select
                              value={set.painLevel}
                              onChange={(e) =>
                                updateSet(exercise.id, set.id, {
                                  painLevel: parseInt(e.target.value),
                                })
                              }
                              className={`input-field text-sm py-2 px-3 w-full ${
                                set.painLevel >= 7 ? 'text-red-400 border-red-500/50' :
                                set.painLevel >= 4 ? 'text-yellow-400 border-yellow-500/50' :
                                'text-green-400'
                              }`}
                            >
                              <option value="0">0 - None</option>
                              <option value="1">1</option>
                              <option value="2">2</option>
                              <option value="3">3 - Mild</option>
                              <option value="4">4</option>
                              <option value="5">5 - Moderate</option>
                              <option value="6">6</option>
                              <option value="7">7 - High</option>
                              <option value="8">8</option>
                              <option value="9">9</option>
                              <option value="10">10 - Severe</option>
                            </select>
                          </div>
                          )}

                          {/* Delete Set */}
                          <div className="col-span-1 flex justify-end">
                            {exercise.sets.length > 1 && (
                              <button
                                onClick={() => removeSet(exercise.id, set.id)}
                                className="p-1 text-iron-600 hover:text-red-400 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          </div>
                        </div>
                      ))}

                      {/* Add Set Button */}
                      <button
                        onClick={() => addSet(exercise.id)}
                        className="mt-2 text-sm text-flame-400 hover:text-flame-300 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add Set
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Add Exercise / Superset Buttons */}
        <div className="flex gap-3">
          <button
            onClick={addExercise}
            className="flex-1 py-4 border-2 border-dashed border-iron-700 rounded-xl
              text-iron-400 hover:text-iron-200 hover:border-iron-600
              flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Exercise
          </button>
          <button
            onClick={addSuperset}
            className="flex-1 py-4 border-2 border-dashed border-purple-500/30 rounded-xl
              text-purple-400 hover:text-purple-300 hover:border-purple-500/50
              flex items-center justify-center gap-2 transition-colors"
          >
            <Zap className="w-5 h-5" />
            Add Superset
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div className={`fixed bottom-0 right-0 p-4 bg-gradient-to-t from-iron-950 via-iron-950/95 to-transparent left-0 ${sidebarOpen ? 'lg:left-64' : 'lg:left-20'} transition-[left] duration-300`}>
        <div className="max-w-3xl mx-auto flex gap-3">
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                {isEditMode ? 'Update Workout' : 'Save Workout'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* RPE Info Modal */}
      <AnimatePresence>
        {rpeModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRpeModalOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-4 max-w-lg mx-auto my-auto max-h-[90vh] overflow-y-auto
                bg-iron-900 border border-iron-700 rounded-2xl z-50"
            >
              <div className="sticky top-0 flex items-center justify-between p-5 border-b border-iron-800 bg-iron-900">
                <h3 className="font-display text-xl text-iron-100">{RPE_INFO.title}</h3>
                <button
                  onClick={() => setRpeModalOpen(false)}
                  className="p-2 text-iron-400 hover:text-iron-100 hover:bg-iron-800 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">
                <p className="text-iron-400 mb-6">{RPE_INFO.description}</p>
                <div className="space-y-3">
                  {RPE_INFO.scale.map((item) => (
                    <div
                      key={item.value}
                      className="flex items-center gap-4 p-3 bg-iron-800/50 rounded-plate"
                    >
                      <div className="w-10 h-10 rounded-plate bg-flame-500/20 flex items-center justify-center">
                        <span className="font-display text-lg text-flame-400">{item.value}</span>
                      </div>
                      <div>
                        <p className="font-medium text-iron-100">{item.label}</p>
                        <p className="text-sm text-iron-500">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}