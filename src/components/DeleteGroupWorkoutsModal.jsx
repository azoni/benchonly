import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Loader2, AlertTriangle, Calendar, Check } from 'lucide-react';
import { format } from 'date-fns';

export default function DeleteGroupWorkoutsModal({
  isOpen,
  onClose,
  group,
  workouts, // Array of workouts with { id, name, date, assignedTo, athleteName }
  coachId,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleteMode, setDeleteMode] = useState('select'); // 'select' | 'date'
  const [selectedWorkouts, setSelectedWorkouts] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [result, setResult] = useState(null);

  // Group workouts by date
  const workoutsByDate = workouts?.reduce((acc, w) => {
    const dateKey = w.date?.toDate?.()
      ? format(w.date.toDate(), 'yyyy-MM-dd')
      : w.date?.split?.('T')?.[0] || 'unknown';
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(w);
    return acc;
  }, {}) || {};

  const dates = Object.keys(workoutsByDate).sort().reverse();

  const toggleWorkout = (id) => {
    setSelectedWorkouts(prev =>
      prev.includes(id) ? prev.filter(wid => wid !== id) : [...prev, id]
    );
  };

  const selectAllForDate = (date) => {
    const ids = workoutsByDate[date]?.map(w => w.id) || [];
    const allSelected = ids.every(id => selectedWorkouts.includes(id));
    if (allSelected) {
      setSelectedWorkouts(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedWorkouts(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const handleDelete = async () => {
    if (deleteMode === 'select' && selectedWorkouts.length === 0) {
      setError('Select at least one workout to delete');
      return;
    }
    if (deleteMode === 'date' && !selectedDate) {
      setError('Select a date');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/delete-group-workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.id,
          coachId,
          workoutIds: deleteMode === 'select' ? selectedWorkouts : undefined,
          deleteByDate: deleteMode === 'date' ? selectedDate : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete');
      }

      const data = await response.json();
      setResult(data);

    } catch (err) {
      console.error('Delete error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    onSuccess?.();
    handleClose();
  };

  const handleClose = () => {
    setSelectedWorkouts([]);
    setSelectedDate('');
    setError(null);
    setResult(null);
    setDeleteMode('select');
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
          className="bg-iron-900 rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-iron-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-iron-100">Delete Group Workouts</h2>
                <p className="text-sm text-iron-500">{group?.name}</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 text-iron-400 hover:text-iron-200 rounded-xl">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {!result ? (
              <div className="space-y-4">
                {/* Warning */}
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">
                    This will permanently delete the selected workouts. This cannot be undone.
                  </p>
                </div>

                {/* Delete mode toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteMode('select')}
                    className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors
                      ${deleteMode === 'select'
                        ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                        : 'border-iron-700 text-iron-400 hover:border-iron-600'
                      }`}
                  >
                    Select Individual
                  </button>
                  <button
                    onClick={() => setDeleteMode('date')}
                    className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors
                      ${deleteMode === 'date'
                        ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                        : 'border-iron-700 text-iron-400 hover:border-iron-600'
                      }`}
                  >
                    Delete by Date
                  </button>
                </div>

                {deleteMode === 'select' ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {dates.length === 0 ? (
                      <p className="text-iron-500 text-center py-4">No workouts found</p>
                    ) : (
                      dates.map(date => (
                        <div key={date} className="border border-iron-800 rounded-lg overflow-hidden">
                          <button
                            onClick={() => selectAllForDate(date)}
                            className="w-full flex items-center justify-between p-3 bg-iron-800/50 hover:bg-iron-800"
                          >
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-iron-500" />
                              <span className="text-iron-200 font-medium">{date}</span>
                            </div>
                            <span className="text-xs text-iron-500">
                              {workoutsByDate[date]?.length} workouts
                            </span>
                          </button>
                          <div className="divide-y divide-iron-800">
                            {workoutsByDate[date]?.map(w => (
                              <button
                                key={w.id}
                                onClick={() => toggleWorkout(w.id)}
                                className="w-full flex items-center gap-3 p-3 hover:bg-iron-800/30"
                              >
                                <div className={`w-5 h-5 rounded border flex items-center justify-center
                                  ${selectedWorkouts.includes(w.id)
                                    ? 'border-red-500 bg-red-500'
                                    : 'border-iron-600'
                                  }`}
                                >
                                  {selectedWorkouts.includes(w.id) && (
                                    <Check className="w-3 h-3 text-white" />
                                  )}
                                </div>
                                <div className="flex-1 text-left">
                                  <p className="text-sm text-iron-200">{w.athleteName || 'Unknown'}</p>
                                  <p className="text-xs text-iron-500">{w.name}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm text-iron-400 mb-2">
                      Select date to delete all workouts
                    </label>
                    <select
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="input-field w-full"
                    >
                      <option value="">Select a date...</option>
                      {dates.map(date => (
                        <option key={date} value={date}>
                          {date} ({workoutsByDate[date]?.length} workouts)
                        </option>
                      ))}
                    </select>
                    {selectedDate && (
                      <p className="text-sm text-red-400 mt-2">
                        This will delete {workoutsByDate[selectedDate]?.length} workout(s)
                      </p>
                    )}
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}
              </div>
            ) : (
              /* Success */
              <div className="py-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-lg font-medium text-iron-100 mb-2">
                  Deleted Successfully
                </h3>
                <p className="text-iron-400">
                  {result.deletedCount} workout(s) have been removed.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-iron-800 flex gap-3">
            {!result ? (
              <>
                <button onClick={handleClose} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading || (deleteMode === 'select' && selectedWorkouts.length === 0) || (deleteMode === 'date' && !selectedDate)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-iron-700 text-white rounded-xl font-medium transition-colors"
                >
                  {loading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Deleting...</>
                  ) : (
                    <>
                      <Trash2 className="w-5 h-5" />
                      Delete {deleteMode === 'select' ? selectedWorkouts.length : workoutsByDate[selectedDate]?.length || 0}
                    </>
                  )}
                </button>
              </>
            ) : (
              <button onClick={handleDone} className="btn-primary flex-1">
                Done
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}