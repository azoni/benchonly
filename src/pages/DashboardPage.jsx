import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Calendar,
  Target,
  Users,
  ChevronRight,
  Flame,
  Dumbbell,
  Clock,
  Plus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { workoutService, goalService, groupService } from '../services/firestore';
import { format, startOfWeek, endOfWeek, isToday, parseISO } from 'date-fns';

export default function DashboardPage() {
  const { user, userProfile } = useAuth();
  const [stats, setStats] = useState({
    workoutsThisWeek: 0,
    currentStreak: 0,
    totalWorkouts: 0,
    activeGoals: 0,
  });
  const [recentWorkouts, setRecentWorkouts] = useState([]);
  const [upcomingWorkouts, setUpcomingWorkouts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isGuest } = useAuth();

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    try {
      // Use sample data for guests
      if (isGuest) {
        const { SAMPLE_WORKOUTS, SAMPLE_GOALS } = await import('../context/AuthContext');
        setRecentWorkouts(SAMPLE_WORKOUTS.slice(0, 5));
        setGoals(SAMPLE_GOALS);
        
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
        
        const weekWorkouts = SAMPLE_WORKOUTS.filter((w) => {
          const date = w.date instanceof Date ? w.date : new Date(w.date);
          return date >= weekStart && date <= weekEnd;
        });

        setStats({
          workoutsThisWeek: weekWorkouts.length,
          currentStreak: 3,
          totalWorkouts: SAMPLE_WORKOUTS.length,
          activeGoals: SAMPLE_GOALS.filter((g) => g.status === 'active').length,
        });
        setLoading(false);
        return;
      }

      // Load workouts
      const workouts = await workoutService.getByUser(user.uid, 20);
      setRecentWorkouts(workouts.slice(0, 5));

      // Calculate stats
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      
      const weekWorkouts = workouts.filter((w) => {
        const date = w.date?.toDate ? w.date.toDate() : new Date(w.date);
        return date >= weekStart && date <= weekEnd;
      });

      // Load goals
      const userGoals = await goalService.getByUser(user.uid);
      setGoals(userGoals.slice(0, 3));

      setStats({
        workoutsThisWeek: weekWorkouts.length,
        currentStreak: calculateStreak(workouts),
        totalWorkouts: workouts.length,
        activeGoals: userGoals.filter((g) => g.status === 'active').length,
      });

      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  };

  const calculateStreak = (workouts) => {
    // Simple streak calculation - can be enhanced
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 30; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      
      const hasWorkout = workouts.some((w) => {
        const workoutDate = w.date?.toDate ? w.date.toDate() : new Date(w.date);
        workoutDate.setHours(0, 0, 0, 0);
        return workoutDate.getTime() === checkDate.getTime();
      });

      if (hasWorkout) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return streak;
  };

  const statCards = [
    {
      label: 'This Week',
      value: stats.workoutsThisWeek,
      icon: Calendar,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Current Streak',
      value: `${stats.currentStreak} days`,
      icon: Flame,
      color: 'text-flame-400',
      bgColor: 'bg-flame-500/10',
    },
    {
      label: 'Total Workouts',
      value: stats.totalWorkouts,
      icon: Dumbbell,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Active Goals',
      value: stats.activeGoals,
      icon: Target,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md text-iron-50">
            {getGreeting()}, {user?.displayName?.split(' ')[0]}
          </h1>
          <p className="text-iron-400 mt-1">
            {format(new Date(), "EEEE, MMMM d")} — Let's crush it today.
          </p>
        </div>

        <Link to="/workouts/new" className="btn-primary flex items-center gap-2 w-fit">
          <Plus className="w-5 h-5" />
          New Workout
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="card-steel p-5 rounded-xl"
          >
            <div className={`w-10 h-10 ${stat.bgColor} rounded-plate flex items-center justify-center mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="metric-value">{stat.value}</p>
            <p className="metric-label mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Workouts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 card-steel rounded-xl"
        >
          <div className="flex items-center justify-between p-5 border-b border-iron-800">
            <h2 className="font-display text-xl text-iron-100">Recent Workouts</h2>
            <Link to="/workouts" className="text-sm text-flame-400 hover:text-flame-300 flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="divide-y divide-iron-800">
            {recentWorkouts.length > 0 ? (
              recentWorkouts.map((workout) => {
                const date = workout.date?.toDate ? workout.date.toDate() : new Date(workout.date);
                return (
                  <Link
                    key={workout.id}
                    to={`/workouts/${workout.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-iron-800/30 transition-colors"
                  >
                    <div className={`w-12 h-12 rounded-plate flex items-center justify-center
                      ${isToday(date) ? 'bg-flame-500/20 text-flame-400' : 'bg-iron-800 text-iron-400'}`}>
                      <Dumbbell className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-iron-100 truncate">
                        {workout.name || 'Workout'}
                      </h3>
                      <p className="text-sm text-iron-500">
                        {workout.exercises?.length || 0} exercises • {format(date, 'MMM d')}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-iron-600" />
                  </Link>
                );
              })
            ) : (
              <div className="p-8 text-center">
                <Dumbbell className="w-12 h-12 text-iron-700 mx-auto mb-3" />
                <p className="text-iron-400">No workouts yet</p>
                <Link to="/workouts/new" className="text-flame-400 hover:text-flame-300 text-sm mt-1 inline-block">
                  Log your first workout
                </Link>
              </div>
            )}
          </div>
        </motion.div>

        {/* Goals Progress */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card-steel rounded-xl"
        >
          <div className="flex items-center justify-between p-5 border-b border-iron-800">
            <h2 className="font-display text-xl text-iron-100">Goals</h2>
            <Link to="/goals" className="text-sm text-flame-400 hover:text-flame-300 flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="p-4 space-y-4">
            {goals.length > 0 ? (
              goals.map((goal) => {
                const startWeight = goal.startWeight || goal.currentWeight || 0;
                const currentWeight = goal.currentWeight || startWeight;
                const targetWeight = goal.targetWeight || 0;
                let progress = 0;
                if (currentWeight > startWeight && targetWeight > startWeight) {
                  progress = Math.min(100, Math.round(((currentWeight - startWeight) / (targetWeight - startWeight)) * 100));
                }
                
                return (
                  <div key={goal.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-iron-100 font-medium">{goal.lift}</span>
                      <span className="text-xs text-iron-500">
                        {currentWeight} / {targetWeight} lbs
                      </span>
                    </div>
                    <div className="h-2 bg-iron-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-flame-500 to-flame-400 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-iron-500">
                      Target: {format(goal.targetDate?.toDate ? goal.targetDate.toDate() : new Date(goal.targetDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center">
                <Target className="w-10 h-10 text-iron-700 mx-auto mb-2" />
                <p className="text-iron-400 text-sm">No goals set</p>
                <Link to="/goals/new" className="text-flame-400 hover:text-flame-300 text-sm mt-1 inline-block">
                  Set your first goal
                </Link>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {[
          { label: 'Log Workout', icon: Dumbbell, path: '/workouts/new', color: 'flame' },
          { label: 'View Calendar', icon: Calendar, path: '/calendar', color: 'blue' },
          { label: 'My Groups', icon: Users, path: '/groups', color: 'green' },
          { label: 'Set Goal', icon: Target, path: '/goals/new', color: 'purple' },
        ].map((action) => (
          <Link
            key={action.label}
            to={action.path}
            className="group card-steel p-4 rounded-xl hover:border-glow transition-all duration-200 flex items-center gap-3"
          >
            <div className={`w-10 h-10 rounded-plate flex items-center justify-center
              ${action.color === 'flame' ? 'bg-flame-500/10 text-flame-400' : ''}
              ${action.color === 'blue' ? 'bg-blue-500/10 text-blue-400' : ''}
              ${action.color === 'green' ? 'bg-green-500/10 text-green-400' : ''}
              ${action.color === 'purple' ? 'bg-purple-500/10 text-purple-400' : ''}`}
            >
              <action.icon className="w-5 h-5" />
            </div>
            <span className="font-medium text-iron-200 group-hover:text-iron-50 transition-colors">
              {action.label}
            </span>
          </Link>
        ))}
      </motion.div>
    </div>
  );
}