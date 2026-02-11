import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Dumbbell,
  Palmtree,
  X as XIcon,
  Check,
  Calendar as CalendarIcon,
  Repeat,
  Target,
  Users,
  Award,
  SkipForward,
  Undo2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { workoutService, scheduleService, attendanceService, goalService, groupWorkoutService, programService } from '../services/firestore';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday,
  isPast,
  startOfDay,
} from 'date-fns';
import { toDateString, getDisplayDate } from '../utils/dateUtils';

export default function CalendarPage() {
  const { user, isGuest } = useAuth();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [workouts, setWorkouts] = useState([]);
  const [groupWorkouts, setGroupWorkouts] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [goals, setGoals] = useState([]);
  const [activePrograms, setActivePrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('workout'); // 'workout' | 'vacation' | 'schedule'

  useEffect(() => {
    if (user) {
      loadCalendarData();
    }
  }, [user, currentMonth]);

  const loadCalendarData = async () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    try {
      if (isGuest) {
        const { getSampleWorkouts, SAMPLE_GOALS } = await import('../context/AuthContext');
        setWorkouts(getSampleWorkouts());
        setGroupWorkouts([]);
        setSchedules([]);
        setAttendance([]);
        setGoals(SAMPLE_GOALS.filter(g => g.status === 'active'));
        setLoading(false);
        return;
      }

      const [workoutsData, groupWorkoutsData, schedulesData, attendanceData, goalsData, programsData] = await Promise.all([
        workoutService.getByDateRange(user.uid, start, end),
        groupWorkoutService.getByUser(user.uid),
        scheduleService.getByUser(user.uid),
        attendanceService.getByUser(user.uid, start, end),
        goalService.getByUser(user.uid),
        programService.getActive(user.uid).catch(() => []),
      ]);

      setWorkouts(workoutsData);
      setGroupWorkouts(groupWorkoutsData);
      setSchedules(schedulesData);
      setAttendance(attendanceData);
      setGoals(goalsData.filter(g => g.status === 'active'));
      setActivePrograms(programsData);
    } catch (error) {
      console.error('Error loading calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = () => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  };

  const getGoalDeadline = (date) => {
    const dateStr = toDateString(date);
    return goals.find((g) => {
      return toDateString(g.targetDate) === dateStr;
    });
  };

  // Check if any goal was completed on this date
  const getCompletedGoal = (date) => {
    const dateStr = toDateString(date);
    return goals.find((g) => {
      if (g.status !== 'completed' || !g.completedAt) return false;
      const completedDate = g.completedAt?.toDate ? g.completedAt.toDate() : new Date(g.completedAt);
      return toDateString(completedDate) === dateStr;
    });
  };

  // Check if a recurring schedule is skipped on a date
  const isScheduleSkipped = (schedule, dateStr) => {
    return (schedule.skippedDates || []).includes(dateStr);
  };

  const getDateStatus = (date) => {
    const dateStr = toDateString(date);
    const dayOfWeek = format(date, 'EEEE').toLowerCase();
    const dayIsPast = isPast(startOfDay(date)) && !isToday(date);
    
    // Check for completed workout
    const hasWorkout = workouts.some((w) => {
      return toDateString(w.date) === dateStr;
    });

    // Check for group workout assigned to user
    const hasGroupWorkout = groupWorkouts.some((w) => {
      try {
        return toDateString(w.date) === dateStr;
      } catch {
        return false;
      }
    });

    // Check for vacation
    const isVacation = attendance.some(
      (a) => a.date === dateStr && a.status === 'vacation'
    );

    // Check for missed day
    const isMissed = attendance.some(
      (a) => a.date === dateStr && a.status === 'missed'
    );

    // Check for scheduled workout (excluding skipped)
    const activeSchedules = schedules.filter((s) => {
      if (s.type === 'recurring') {
        return s.days?.includes(dayOfWeek) && !isScheduleSkipped(s, dateStr);
      }
      return s.date === dateStr;
    });
    const isScheduled = activeSchedules.length > 0;

    // Auto-complete: past recurring schedules that aren't skipped count as completed
    const hasAutoCompleted = dayIsPast && activeSchedules.some(s => s.type === 'recurring');

    // Check for completed goal on this date
    const hasCompletedGoal = !!getCompletedGoal(date);

    // Check for program day
    let programDay = null;
    for (const prog of activePrograms) {
      const pd = programService.getProgramDay(prog, date);
      if (pd) { programDay = pd; break; }
    }
    const hasProgramDay = !!programDay;

    return { hasWorkout, hasGroupWorkout, isVacation, isMissed, isScheduled, hasCompletedGoal, hasAutoCompleted, hasProgramDay, programDay };
  };

  const getSelectedDateWorkouts = () => {
    const dateStr = toDateString(selectedDate);
    return workouts.filter((w) => {
      return toDateString(w.date) === dateStr;
    });
  };

  const getSelectedDateGroupWorkouts = () => {
    const dateStr = toDateString(selectedDate);
    return groupWorkouts.filter((w) => {
      try {
        return toDateString(w.date) === dateStr;
      } catch {
        return false;
      }
    });
  };

  const getSelectedDateSchedule = () => {
    const dateStr = toDateString(selectedDate);
    const dayOfWeek = format(selectedDate, 'EEEE').toLowerCase();

    return schedules.filter((s) => {
      if (s.type === 'recurring') {
        return s.days?.includes(dayOfWeek);
      }
      return s.date === dateStr;
    }).map(s => ({
      ...s,
      isSkipped: isScheduleSkipped(s, dateStr),
    }));
  };

  const getSelectedDateProgramDay = () => {
    for (const prog of activePrograms) {
      const pd = programService.getProgramDay(prog, selectedDate);
      if (pd) return pd;
    }
    return null;
  };

  const handleSkipSchedule = async (scheduleId, dateStr) => {
    try {
      const schedule = schedules.find(s => s.id === scheduleId);
      const currentSkips = schedule?.skippedDates || [];
      await scheduleService.update(scheduleId, {
        skippedDates: [...currentSkips, dateStr]
      });
      // Update local state
      setSchedules(prev => prev.map(s => 
        s.id === scheduleId 
          ? { ...s, skippedDates: [...(s.skippedDates || []), dateStr] }
          : s
      ));
    } catch (error) {
      console.error('Error skipping schedule:', error);
    }
  };

  const handleUnskipSchedule = async (scheduleId, dateStr) => {
    try {
      const schedule = schedules.find(s => s.id === scheduleId);
      const currentSkips = schedule?.skippedDates || [];
      await scheduleService.update(scheduleId, {
        skippedDates: currentSkips.filter(d => d !== dateStr)
      });
      // Update local state
      setSchedules(prev => prev.map(s => 
        s.id === scheduleId 
          ? { ...s, skippedDates: (s.skippedDates || []).filter(d => d !== dateStr) }
          : s
      ));
    } catch (error) {
      console.error('Error unskipping schedule:', error);
    }
  };

  const handleMarkVacation = async () => {
    try {
      await attendanceService.log(user.uid, selectedDate, 'vacation');
      loadCalendarData();
      setModalOpen(false);
    } catch (error) {
      console.error('Error marking vacation:', error);
    }
  };

  const handleMarkMissed = async () => {
    try {
      await attendanceService.log(user.uid, selectedDate, 'missed');
      loadCalendarData();
      setModalOpen(false);
    } catch (error) {
      console.error('Error marking missed:', error);
    }
  };

  const days = getDaysInMonth();
  const selectedWorkouts = getSelectedDateWorkouts();
  const selectedGroupWorkouts = getSelectedDateGroupWorkouts();
  const selectedSchedule = getSelectedDateSchedule();
  
  // Get program day for selected date
  const selectedProgramDay = (() => {
    for (const prog of activePrograms) {
      const pd = programService.getProgramDay(prog, selectedDate);
      if (pd) return pd;
    }
    return null;
  })();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <div className="card-steel rounded-xl overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between p-4 border-b border-iron-800">
              <button
                onClick={() => setCurrentMonth((prev) => subMonths(prev, 1))}
                className="p-2 text-iron-400 hover:text-iron-100 hover:bg-iron-800 rounded-plate transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <h2 className="font-display text-xl text-iron-100">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>

              <button
                onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
                className="p-2 text-iron-400 hover:text-iron-100 hover:bg-iron-800 rounded-plate transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 border-b border-iron-800">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div
                  key={day}
                  className="py-3 text-center text-xs font-medium text-iron-500 uppercase"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                const status = getDateStatus(day);
                const goalDeadline = getGoalDeadline(day);
                const isSelected = isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentMonth);

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    className={`aspect-square p-1 border-b border-r border-iron-800/50
                      transition-colors relative group
                      ${!isCurrentMonth ? 'opacity-30' : ''}
                      ${isSelected ? 'bg-flame-500/10' : 'hover:bg-iron-800/50'}
                      ${goalDeadline ? 'ring-1 ring-inset ring-purple-500/50' : ''}`}
                  >
                    <div
                      className={`w-full h-full rounded-plate flex flex-col items-center justify-center
                        ${isToday(day) ? 'ring-2 ring-flame-500/50' : ''}`}
                    >
                      <span
                        className={`text-sm font-medium
                          ${isSelected ? 'text-flame-400' : 'text-iron-300'}
                          ${isToday(day) ? 'text-flame-400' : ''}
                          ${goalDeadline ? 'text-purple-400' : ''}`}
                      >
                        {format(day, 'd')}
                      </span>

                      {/* Status Indicators */}
                      <div className="flex gap-1 mt-1">
                        {status.hasWorkout && (
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        )}
                        {status.hasGroupWorkout && (
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" title="Group Workout" />
                        )}
                        {status.hasAutoCompleted && !status.hasWorkout && (
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500/60" title="Auto-completed" />
                        )}
                        {status.isScheduled && !status.hasWorkout && !status.hasAutoCompleted && (
                          <div className="w-1.5 h-1.5 rounded-full bg-flame-500/50" />
                        )}
                        {status.hasProgramDay && !status.hasWorkout && (
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" title={status.programDay?.label} />
                        )}
                        {status.isVacation && (
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        )}
                        {status.isMissed && (
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        )}
                        {goalDeadline && (
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500" title={`Goal: ${goalDeadline.lift}`} />
                        )}
                        {status.hasCompletedGoal && (
                          <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" title="Goal Achieved!" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 p-4 border-t border-iron-800">
              <div className="flex items-center gap-2 text-xs text-iron-400">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Completed
              </div>
              <div className="flex items-center gap-2 text-xs text-iron-400">
                <div className="w-2 h-2 rounded-full bg-green-500/60" />
                Auto-done
              </div>
              <div className="flex items-center gap-2 text-xs text-iron-400">
                <div className="w-2 h-2 rounded-full bg-cyan-500" />
                Group
              </div>
              <div className="flex items-center gap-2 text-xs text-iron-400">
                <div className="w-2 h-2 rounded-full bg-flame-500/50" />
                Scheduled
              </div>
              <div className="flex items-center gap-2 text-xs text-iron-400">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                Program
              </div>
              <div className="flex items-center gap-2 text-xs text-iron-400">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                Vacation
              </div>
              <div className="flex items-center gap-2 text-xs text-iron-400">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                Missed
              </div>
              <div className="flex items-center gap-2 text-xs text-iron-400">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                Goal Deadline
              </div>
              <div className="flex items-center gap-2 text-xs text-iron-400">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                Goal Achieved
              </div>
              <div className="flex items-center gap-2 text-xs text-iron-400">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                Program
              </div>
            </div>
          </div>
        </div>

        {/* Selected Date Panel */}
        <div className="card-steel rounded-xl">
          <div className="p-4 border-b border-iron-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-iron-500">
                  {format(selectedDate, 'EEEE')}
                </p>
                <h3 className="font-display text-2xl text-iron-100">
                  {format(selectedDate, 'MMMM d')}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(true)}
                className="p-2 bg-flame-500/10 text-flame-400 rounded-plate
                  hover:bg-flame-500/20 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Program Day */}
            {selectedProgramDay && (
              <div>
                <h4 className="text-xs text-iron-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Target className="w-3.5 h-3.5" />
                  Program
                </h4>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-plate">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-plate bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <Dumbbell className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-iron-100">{selectedProgramDay.label}</p>
                      <p className="text-xs text-iron-500">
                        {selectedProgramDay.programName} · Wk {selectedProgramDay.weekNumber} · {selectedProgramDay.phase}
                      </p>
                      <p className="text-xs text-amber-400 mt-0.5">
                        {selectedProgramDay.primaryLift}: {selectedProgramDay.primaryScheme} @ {selectedProgramDay.intensity}
                      </p>
                    </div>
                  </div>
                  {!selectedWorkouts.some(w => w.programId === selectedProgramDay.programId) && (
                    <Link
                      to={`/programs/${selectedProgramDay.programId}`}
                      className="mt-2 flex items-center justify-center gap-1.5 py-1.5 bg-amber-500/20 text-amber-300 text-xs font-medium rounded-lg hover:bg-amber-500/30 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" /> Generate This Workout
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Scheduled Workouts */}
            {selectedSchedule.length > 0 && (
              <div>
                <h4 className="text-xs text-iron-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Repeat className="w-3.5 h-3.5" />
                  Scheduled
                </h4>
                <div className="space-y-2">
                  {selectedSchedule.map((schedule) => {
                    const dateStr = toDateString(selectedDate);
                    const dayIsPast = isPast(startOfDay(selectedDate)) && !isToday(selectedDate);
                    const isAutoCompleted = dayIsPast && schedule.type === 'recurring' && !schedule.isSkipped;
                    
                    return (
                      <div
                        key={schedule.id}
                        className={`flex items-center gap-3 p-3 rounded-plate transition-colors ${
                          schedule.isSkipped
                            ? 'bg-iron-800/30 opacity-50'
                            : isAutoCompleted
                              ? 'bg-green-500/10 border border-green-500/20'
                              : 'bg-iron-800/50'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-plate flex items-center justify-center ${
                          schedule.isSkipped
                            ? 'bg-iron-700/50'
                            : isAutoCompleted
                              ? 'bg-green-500/20'
                              : 'bg-flame-500/20'
                        }`}>
                          {isAutoCompleted ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Dumbbell className={`w-4 h-4 ${schedule.isSkipped ? 'text-iron-500' : 'text-flame-400'}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${
                            schedule.isSkipped ? 'text-iron-500 line-through' : 'text-iron-100'
                          }`}>
                            {schedule.name || 'Workout'}
                          </p>
                          <p className="text-xs text-iron-500">
                            {schedule.isSkipped ? 'Skipped' : isAutoCompleted ? 'Completed' : schedule.type === 'recurring' ? 'Recurring' : 'One-time'}
                          </p>
                        </div>
                        
                        {/* Skip / Undo buttons for recurring schedules */}
                        {schedule.type === 'recurring' && !isGuest && (
                          schedule.isSkipped ? (
                            <button
                              onClick={() => handleUnskipSchedule(schedule.id, dateStr)}
                              className="p-1.5 text-iron-500 hover:text-iron-300 hover:bg-iron-700 rounded-lg transition-colors"
                              title="Undo skip"
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSkipSchedule(schedule.id, dateStr)}
                              className="p-1.5 text-iron-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                              title="Skip this day"
                            >
                              <SkipForward className="w-4 h-4" />
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Group Workouts */}
            {selectedGroupWorkouts.length > 0 && (
              <div>
                <h4 className="text-xs text-iron-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Group Workouts
                </h4>
                {selectedGroupWorkouts.map((workout) => (
                  <a
                    key={workout.id}
                    href={`/workouts/group/${workout.id}`}
                    className="flex items-center gap-3 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-plate mb-2 hover:border-cyan-500/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-plate bg-cyan-500/20 flex items-center justify-center">
                      <Users className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-iron-100">
                        {workout.name || 'Group Workout'}
                      </p>
                      <p className="text-xs text-iron-500">
                        {workout.exercises?.length || 0} exercises · {workout.status === 'completed' ? 'Completed' : 'Assigned'}
                      </p>
                    </div>
                    {workout.status === 'completed' && (
                      <Check className="w-4 h-4 text-green-400" />
                    )}
                  </a>
                ))}
              </div>
            )}

            {/* Completed Workouts */}
            {selectedWorkouts.length > 0 && (
              <div>
                <h4 className="text-xs text-iron-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5" />
                  Completed
                </h4>
                {selectedWorkouts.map((workout) => (
                  <div
                    key={workout.id}
                    className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-plate"
                  >
                    <div className="w-8 h-8 rounded-plate bg-green-500/20 flex items-center justify-center">
                      <Dumbbell className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-iron-100">
                        {workout.name || 'Workout'}
                      </p>
                      <p className="text-xs text-iron-500">
                        {workout.workoutType === 'cardio' 
                          ? `${workout.duration} min` 
                          : `${workout.exercises?.length || 0} exercises`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Completed Goals */}
            {(() => {
              const completedGoal = getCompletedGoal(selectedDate);
              if (!completedGoal) return null;
              return (
                <div>
                  <h4 className="text-xs text-iron-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Award className="w-3.5 h-3.5" />
                    Goal Achieved
                  </h4>
                  <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-plate">
                    <div className="w-8 h-8 rounded-plate bg-yellow-500/20 flex items-center justify-center">
                      <Award className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-iron-100">
                        {completedGoal.lift}
                      </p>
                      <p className="text-xs text-iron-500">
                        {completedGoal.targetValue || completedGoal.targetWeight} {completedGoal.metricType === 'reps' ? 'reps' : completedGoal.metricType === 'time' ? 'sec' : 'lbs'}
                      </p>
                    </div>
                    <span className="text-yellow-400 text-xs font-medium">🎉</span>
                  </div>
                </div>
              );
            })()}

            {/* Empty State */}
            {selectedSchedule.length === 0 && selectedWorkouts.length === 0 && selectedGroupWorkouts.length === 0 && (
              <div className="py-8 text-center">
                <CalendarIcon className="w-10 h-10 text-iron-700 mx-auto mb-2" />
                <p className="text-sm text-iron-500">Nothing scheduled</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto
                bg-iron-900 border border-iron-700 rounded-2xl z-50 overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-iron-800">
                <h3 className="font-display text-lg text-iron-100">
                  {format(selectedDate, 'MMMM d')}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-2 text-iron-400 hover:text-iron-100 hover:bg-iron-800 rounded-full"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <a
                  href={`/workouts/new?date=${format(selectedDate, 'yyyy-MM-dd')}`}
                  className="flex items-center gap-3 p-4 bg-iron-800/50 hover:bg-iron-800 
                    rounded-plate transition-colors"
                >
                  <div className="w-10 h-10 rounded-plate bg-flame-500/20 flex items-center justify-center">
                    <Dumbbell className="w-5 h-5 text-flame-400" />
                  </div>
                  <div>
                    <p className="font-medium text-iron-100">Log Workout</p>
                    <p className="text-sm text-iron-500">Record completed training</p>
                  </div>
                </a>

                <button
                  onClick={handleMarkVacation}
                  className="w-full flex items-center gap-3 p-4 bg-iron-800/50 hover:bg-iron-800 
                    rounded-plate transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-plate bg-blue-500/20 flex items-center justify-center">
                    <Palmtree className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-iron-100">Mark as Vacation</p>
                    <p className="text-sm text-iron-500">Planned rest day</p>
                  </div>
                </button>

                <button
                  onClick={handleMarkMissed}
                  className="w-full flex items-center gap-3 p-4 bg-iron-800/50 hover:bg-iron-800 
                    rounded-plate transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-plate bg-red-500/20 flex items-center justify-center">
                    <XIcon className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="font-medium text-iron-100">Mark as Missed</p>
                    <p className="text-sm text-iron-500">Unplanned skip</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}