import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  Loader2,
  Users,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Dumbbell,
} from 'lucide-react';
import { format } from 'date-fns';

export default function GenerateGroupWorkoutModal({ 
  isOpen, 
  onClose, 
  group, 
  athletes,
  coachId,
  onSuccess 
}) {
  const [prompt, setPrompt] = useState('');
  const [workoutDate, setWorkoutDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedAthletes, setSelectedAthletes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // Initialize selected athletes when modal opens or athletes change
  useEffect(() => {
    if (isOpen && athletes?.length > 0) {
      setSelectedAthletes(athletes.map(a => a.uid));
    }
  }, [isOpen, athletes]);

  const handleGenerate = async () => {
    if (selectedAthletes.length === 0) {
      setError('Select at least one athlete');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/generate-group-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId,
          groupId: group.id,
          athleteIds: selectedAthletes,
          prompt,
          workoutDate,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate');
      }

      const data = await response.json();
      setResult(data);
      setShowPreview(true);

    } catch (err) {
      console.error('Generation error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    onSuccess?.(result);
    onClose();
  };

  const toggleAthlete = (athleteUid) => {
    setSelectedAthletes(prev => 
      prev.includes(athleteUid)
        ? prev.filter(uid => uid !== athleteUid)
        : [...prev, athleteUid]
    );
  };

  const toggleAll = () => {
    if (selectedAthletes.length === athletes.length) {
      setSelectedAthletes([]);
    } else {
      setSelectedAthletes(athletes.map(a => a.uid));
    }
  };

  // Reset state when modal closes
  const handleClose = () => {
    setPrompt('');
    setResult(null);
    setError(null);
    setShowPreview(false);
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
          className="bg-iron-900 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-iron-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-flame-500/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-flame-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-iron-100">
                  AI Generate Group Workout
                </h2>
                <p className="text-sm text-iron-500">{group?.name}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {!showPreview ? (
              <div className="space-y-4">
                {/* Coach prompt */}
                <div>
                  <label className="block text-sm text-iron-400 mb-2">
                    Describe the workout you want
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., 'Same as Monday Heavy but adjust the weights' or 'Upper body focus, moderate intensity, 45 minutes'"
                    className="input-field w-full min-h-[100px] resize-none"
                  />
                  <p className="text-xs text-iron-500 mt-1">
                    AI will personalize weights for each athlete based on their max lifts and avoid exercises that caused pain.
                  </p>
                </div>

                {/* Date picker */}
                <div>
                  <label className="block text-sm text-iron-400 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Workout Date
                  </label>
                  <input
                    type="date"
                    value={workoutDate}
                    onChange={(e) => setWorkoutDate(e.target.value)}
                    className="input-field w-full"
                  />
                </div>

                {/* Athlete selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-iron-400 flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      Athletes ({selectedAthletes.length}/{athletes?.length || 0})
                    </label>
                    <button
                      onClick={toggleAll}
                      className="text-xs text-flame-400 hover:text-flame-300"
                    >
                      {selectedAthletes.length === athletes?.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {athletes?.map((athlete) => (
                      <button
                        key={athlete.uid}
                        onClick={() => toggleAthlete(athlete.uid)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors
                          ${selectedAthletes.includes(athlete.uid)
                            ? 'border-flame-500 bg-flame-500/10'
                            : 'border-iron-700 bg-iron-800/50 hover:border-iron-600'
                          }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center
                          ${selectedAthletes.includes(athlete.uid)
                            ? 'border-flame-500 bg-flame-500'
                            : 'border-iron-600'
                          }`}
                        >
                          {selectedAthletes.includes(athlete.uid) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        {athlete.photoURL ? (
                          <img src={athlete.photoURL} alt="" className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-iron-700 flex items-center justify-center text-xs text-iron-400">
                            {athlete.displayName?.[0]}
                          </div>
                        )}
                        <span className="text-iron-200">{athlete.displayName || athlete.name}</span>
                        {athlete.painFlags > 0 && (
                          <span className="ml-auto text-xs text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Pain logged
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}
              </div>
            ) : (
              /* Preview results */
              <div className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-green-400 font-medium flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    Workouts generated successfully!
                  </p>
                  <p className="text-sm text-iron-400 mt-1">
                    Created {result?.createdWorkouts?.length || 0} personalized workouts
                  </p>
                </div>

                {/* Workout summary */}
                <div className="p-4 bg-iron-800/50 rounded-lg">
                  <h3 className="font-medium text-iron-100 mb-2">{result?.workoutName}</h3>
                  <div className="space-y-1">
                    {result?.baseExercises?.map((ex, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-iron-400">
                        <Dumbbell className="w-4 h-4" />
                        <span>{ex.name}</span>
                        <span className="text-iron-600">
                          {ex.defaultSets}×{ex.defaultReps}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Per-athlete breakdown */}
                <div>
                  <p className="text-sm text-iron-400 mb-2">Athlete Workouts</p>
                  
                  <div className="space-y-3">
                    {Object.entries(result?.athleteWorkouts || {}).map(([athleteId, workout]) => (
                      <div key={athleteId} className="p-3 bg-iron-800/30 rounded-lg">
                        <h4 className="font-medium text-iron-200 mb-2">{workout.athleteName}</h4>
                        <div className="space-y-1">
                          {workout.exercises?.slice(0, 3).map((ex, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-iron-400">
                              <span className={ex.substitution ? 'text-amber-400' : ''}>
                                {ex.substitution?.replacement || ex.name}
                              </span>
                              <span className="text-iron-600">
                                {ex.sets?.map(s => `${s.prescribedWeight}×${s.prescribedReps}`).join(', ')}
                              </span>
                              {ex.substitution && (
                                <span className="text-amber-400 text-xs">
                                  (modified)
                                </span>
                              )}
                            </div>
                          ))}
                          {workout.exercises?.length > 3 && (
                            <span className="text-xs text-iron-500">
                              +{workout.exercises.length - 3} more exercises
                            </span>
                          )}
                        </div>
                        {workout.modifications && (
                          <p className="text-xs text-amber-400 mt-2">{workout.modifications}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {result?.generalNotes && (
                  <div className="p-3 bg-iron-800/30 rounded-lg">
                    <p className="text-sm text-iron-400">{result.generalNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-iron-800 flex gap-3">
            {!showPreview ? (
              <>
                <button onClick={handleClose} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={loading || selectedAthletes.length === 0}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate for {selectedAthletes.length} Athlete{selectedAthletes.length !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => {
                    setShowPreview(false);
                    setResult(null);
                  }} 
                  className="btn-secondary flex-1"
                >
                  Generate Different
                </button>
                <button
                  onClick={handleConfirm}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Done
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}