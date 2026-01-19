import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Filter,
  Dumbbell,
  ChevronRight,
  Calendar,
  Clock,
  Sparkles,
  MoreVertical,
  Trash2,
  Edit2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { workoutService } from '../services/firestore';
import { format, isToday, isYesterday, isThisWeek, parseISO } from 'date-fns';

export default function WorkoutsPage() {
  const { user, isGuest } = useAuth();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);

  useEffect(() => {
    if (user) {
      loadWorkouts();
    }
  }, [user]);

  const loadWorkouts = async () => {
    try {
      if (isGuest) {
        const { SAMPLE_WORKOUTS } = await import('../context/AuthContext');
        setWorkouts(SAMPLE_WORKOUTS);
        setLoading(false);
        return;
      }
      const data = await workoutService.getByUser(user.uid, 100);
      setWorkouts(data);
    } catch (error) {
      console.error('Error loading workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (workoutId) => {
    if (window.confirm('Are you sure you want to delete this workout?')) {
      if (isGuest) {
        setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
        setActiveMenu(null);
        return;
      }
      try {
        await workoutService.delete(workoutId);
        setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
      } catch (error) {
        console.error('Error deleting workout:', error);
      }
    }
    setActiveMenu(null);
  };

  const getDateLabel = (date) => {
    const d = date instanceof Date ? date : (date?.toDate ? date.toDate() : new Date(date));
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, 'EEEE');
    return format(d, 'MMM d, yyyy');
  };

  const filteredWorkouts = workouts.filter((workout) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      workout.name?.toLowerCase().includes(query) ||
      workout.exercises?.some((e) => e.name?.toLowerCase().includes(query))
    );
  });

  // Group workouts by date
  const groupedWorkouts = filteredWorkouts.reduce((acc, workout) => {
    const date = workout.date?.toDate ? workout.date.toDate() : new Date(workout.date);
    const key = format(date, 'yyyy-MM-dd');
    if (!acc[key]) acc[key] = [];
    acc[key].push(workout);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-display-md text-iron-50">Workouts</h1>
          <p className="text-iron-400 mt-1">
            {workouts.length} total workouts logged
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            to="/workouts/generate"
            className="btn-secondary flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            AI Generate
          </Link>
          <Link to="/workouts/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            New Workout
          </Link>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-iron-500" />
          <input
            type="text"
            placeholder="Search workouts or exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-12"
          />
        </div>
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className={`btn-secondary flex items-center gap-2
            ${filterOpen ? 'border-flame-500/50 text-flame-400' : ''}`}
        >
          <Filter className="w-5 h-5" />
          <span className="hidden sm:inline">Filter</span>
        </button>
      </div>

      {/* Filter Panel */}
      <AnimatePresence>
        {filterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="card-steel rounded-xl p-4 mb-6 overflow-hidden"
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-iron-400 mb-2">Date Range</label>
                <select className="input-field text-sm">
                  <option>All time</option>
                  <option>This week</option>
                  <option>This month</option>
                  <option>Last 3 months</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-iron-400 mb-2">Workout Type</label>
                <select className="input-field text-sm">
                  <option>All types</option>
                  <option>Bench Focus</option>
                  <option>Full Body</option>
                  <option>Upper Body</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Workouts List */}
      {Object.keys(groupedWorkouts).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedWorkouts)
            .sort(([a], [b]) => new Date(b) - new Date(a))
            .map(([dateKey, dateWorkouts]) => (
              <div key={dateKey}>
                <h3 className="text-sm font-medium text-iron-400 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {getDateLabel(new Date(dateKey))}
                </h3>
                <div className="space-y-3">
                  {dateWorkouts.map((workout, index) => (
                    <motion.div
                      key={workout.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="card-steel rounded-xl overflow-hidden group"
                    >
                      <Link
                        to={`/workouts/${workout.id}`}
                        className="flex items-center gap-4 p-4"
                      >
                        <div className={`w-12 h-12 rounded-plate flex items-center justify-center ${
                          workout.status === 'scheduled' 
                            ? 'bg-yellow-500/10' 
                            : 'bg-flame-500/10'
                        }`}>
                          <Dumbbell className={`w-6 h-6 ${
                            workout.status === 'scheduled'
                              ? 'text-yellow-400'
                              : 'text-flame-400'
                          }`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-iron-100 truncate group-hover:text-flame-400 transition-colors">
                              {workout.name || 'Untitled Workout'}
                            </h3>
                            {workout.status === 'scheduled' && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded">
                                Scheduled
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="text-sm text-iron-500 flex items-center gap-1">
                              <Dumbbell className="w-3.5 h-3.5" />
                              {workout.exercises?.length || 0} exercises
                            </span>
                            {workout.duration && (
                              <span className="text-sm text-iron-500 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {workout.duration} min
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Exercise preview */}
                        <div className="hidden lg:flex items-center gap-2">
                          {workout.exercises?.slice(0, 3).map((exercise, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 text-xs bg-iron-800 text-iron-400 rounded"
                            >
                              {exercise.name}
                            </span>
                          ))}
                          {workout.exercises?.length > 3 && (
                            <span className="text-xs text-iron-500">
                              +{workout.exercises.length - 3}
                            </span>
                          )}
                        </div>

                        <ChevronRight className="w-5 h-5 text-iron-600 group-hover:text-iron-400 transition-colors" />
                      </Link>

                      {/* Actions Menu */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveMenu(activeMenu === workout.id ? null : workout.id);
                          }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-iron-500
                            hover:text-iron-300 hover:bg-iron-800 rounded-plate transition-colors z-10"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        <AnimatePresence>
                          {activeMenu === workout.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="absolute right-4 top-12 bg-iron-800 border border-iron-700
                                rounded-plate shadow-xl z-20 py-1 min-w-[140px]"
                            >
                              <Link
                                to={`/workouts/${workout.id}/edit`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-iron-300
                                  hover:bg-iron-700 transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                                Edit
                              </Link>
                              <button
                                onClick={() => handleDelete(workout.id)}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-red-400
                                  hover:bg-iron-700 transition-colors w-full"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="card-steel rounded-xl p-12 text-center">
          <Dumbbell className="w-16 h-16 text-iron-700 mx-auto mb-4" />
          <h3 className="font-display text-xl text-iron-300 mb-2">No workouts yet</h3>
          <p className="text-iron-500 mb-6">
            Start tracking your progress by logging your first workout.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/workouts/generate" className="btn-secondary flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Generate
            </Link>
            <Link to="/workouts/new" className="btn-primary flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Manual Entry
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}