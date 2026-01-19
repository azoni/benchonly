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
import { workoutService, goalService, groupService, scheduleService } from '../services/firestore';
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
        const { getSampleWorkouts, SAMPLE_GOALS } = await import('../context/AuthContext');
        const sampleWorkouts = getSampleWorkouts();
        setRecentWorkouts(sampleWorkouts.slice(0, 5));
        setGoals(SAMPLE_GOALS);
        
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
        
        const weekWorkouts = sampleWorkouts.filter((w) => {
          const date = w.date instanceof Date ? w.date : new Date(w.date);
          return date >= weekStart && date <= weekEnd;
        });

        setStats({
          workoutsThisWeek: weekWorkouts.length,
          currentStreak: 3,
          totalWorkouts: sampleWorkouts.length,
          activeGoals: SAMPLE_GOALS.filter((g) => g.status === 'active').length,
        });
        setLoading(false);
        return;
      }

      // Load workouts and schedules
      const [workouts, schedules] = await Promise.all([
        workoutService.getByUser(user.uid, 60),
        scheduleService.getByUser(user.uid)
      ]);
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
        currentStreak: calculateStreak(workouts, schedules),
        totalWorkouts: workouts.length,
        activeGoals: userGoals.filter((g) => g.status === 'active').length,
      });

      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  };

  const calculateStreak = (workouts, schedules = []) => {
    // Streak = consecutive scheduled workout days where you completed a workout
    // Rest days (unscheduled) don't break the streak
    
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    // Get recurring schedule days
    const recurringDays = schedules
      .filter(s => s.type === 'recurring' && s.days)
      .flatMap(s => s.days);
    
    // Get one-time scheduled dates
    const oneTimeDates = schedules
      .filter(s => s.type !== 'recurring' && s.date)
      .map(s => s.date);
    
    // Also count days that have scheduled workouts (status: 'scheduled' or 'completed')
    const workoutDates = workouts.map(w => {
      const d = w.date?.toDate ? w.date.toDate() : new Date(w.date);
      d.setHours(0, 0, 0, 0);
      return d;
    });
    
    // Check if a date was a scheduled workout day
    const isScheduledDay = (date) => {
      const dayName = dayNames[date.getDay()];
      const dateStr = date.toISOString().split('T')[0];
      
      // Check recurring schedule
      if (recurringDays.includes(dayName)) return true;
      
      // Check one-time schedules
      if (oneTimeDates.includes(dateStr)) return true;
      
      // Check if there was a scheduled workout for this day
      const hasScheduledWorkout = workouts.some(w => {
        const wDate = w.date?.toDate ? w.date.toDate() : new Date(w.date);
        wDate.setHours(0, 0, 0, 0);
        return wDate.getTime() === date.getTime();
      });
      
      return hasScheduledWorkout;
    };
    
    // Check if a date has a completed workout
    const hasCompletedWorkout = (date) => {
      return workouts.some(w => {
        if (w.status !== 'completed') return false;
        const wDate = w.date?.toDate ? w.date.toDate() : new Date(w.date);
        wDate.setHours(0, 0, 0, 0);
        return wDate.getTime() === date.getTime();
      });
    };

    // Go backwards from today
    for (let i = 0; i < 60; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      
      const scheduled = isScheduledDay(checkDate);
      const completed = hasCompletedWorkout(checkDate);
      
      if (scheduled) {
        if (completed) {
          streak++;
        } else if (i > 0) {
          // Missed a scheduled day - streak broken (allow today to be incomplete)
          break;
        }
      }
      // If not scheduled, just skip (rest day doesn't break streak)
    }

    return streak;
  };

  const statCards = [
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
  ];

  // Find upcoming/scheduled workouts from recent
  const scheduledWorkouts = recentWorkouts.filter(w => w.status === 'scheduled');

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

      {/* Stats and Upcoming */}
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

        {/* Upcoming Workout Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-2 card-steel p-5 rounded-xl border-l-4 border-l-yellow-500"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-500/10 rounded-plate flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-xs text-yellow-400 font-medium uppercase tracking-wider">Next Up</p>
                {scheduledWorkouts.length > 0 ? (
                  <p className="font-display text-lg text-iron-100">{scheduledWorkouts[0].name}</p>
                ) : (
                  <p className="text-iron-400">No scheduled workouts</p>
                )}
              </div>
            </div>
            {scheduledWorkouts.length > 0 ? (
              <Link 
                to={`/workouts/${scheduledWorkouts[0].id}`}
                className="btn-primary"
              >
                Start Workout
              </Link>
            ) : (
              <Link 
                to="/workouts/new"
                className="btn-secondary"
              >
                Schedule One
              </Link>
            )}
          </div>
        </motion.div>
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
          { label: 'New Workout', icon: Dumbbell, path: '/workouts/new', color: 'flame' },
          { label: 'View Calendar', icon: Calendar, path: '/calendar', color: 'blue' },
          { label: 'My Groups', icon: Users, path: '/groups', color: 'green' },
          { label: 'Set Goal', icon: Target, path: '/goals', color: 'purple' },
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