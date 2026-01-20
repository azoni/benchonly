import { useState } from 'react'
import { Calculator, Dumbbell, ChevronDown, Info } from 'lucide-react'

const COMMON_EXERCISES = [
  'Bench Press',
  'Squat',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
  'Incline Bench Press',
  'Close Grip Bench',
  'Front Squat',
  'Romanian Deadlift',
]

// 1RM Formulas
const FORMULAS = {
  epley: {
    name: 'Epley',
    calc: (weight, reps) => weight * (1 + reps / 30),
    description: 'Most common formula, good for moderate rep ranges'
  },
  brzycki: {
    name: 'Brzycki',
    calc: (weight, reps) => weight * (36 / (37 - reps)),
    description: 'Accurate for lower rep ranges (1-10)'
  },
  lombardi: {
    name: 'Lombardi',
    calc: (weight, reps) => weight * Math.pow(reps, 0.1),
    description: 'Simple formula, tends to estimate conservatively'
  },
  oconner: {
    name: "O'Conner",
    calc: (weight, reps) => weight * (1 + reps / 40),
    description: 'Similar to Epley but more conservative'
  }
}

// Calculate percentage of 1RM for rep ranges
const getPercentageChart = (oneRM) => {
  return [
    { reps: 1, percent: 100, weight: oneRM },
    { reps: 2, percent: 97, weight: oneRM * 0.97 },
    { reps: 3, percent: 94, weight: oneRM * 0.94 },
    { reps: 4, percent: 92, weight: oneRM * 0.92 },
    { reps: 5, percent: 89, weight: oneRM * 0.89 },
    { reps: 6, percent: 86, weight: oneRM * 0.86 },
    { reps: 7, percent: 83, weight: oneRM * 0.83 },
    { reps: 8, percent: 81, weight: oneRM * 0.81 },
    { reps: 9, percent: 78, weight: oneRM * 0.78 },
    { reps: 10, percent: 75, weight: oneRM * 0.75 },
    { reps: 12, percent: 69, weight: oneRM * 0.69 },
    { reps: 15, percent: 61, weight: oneRM * 0.61 },
  ]
}

export default function ToolsPage() {
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [exercise, setExercise] = useState('')
  const [formula, setFormula] = useState('epley')
  const [showFormulaInfo, setShowFormulaInfo] = useState(false)

  const calculateOneRM = () => {
    const w = parseFloat(weight)
    const r = parseInt(reps)
    if (!w || !r || r < 1) return null
    if (r === 1) return w // If 1 rep, that's already 1RM
    if (r > 30) return null // Formulas aren't accurate above ~30 reps
    
    return FORMULAS[formula].calc(w, r)
  }

  const oneRM = calculateOneRM()
  const percentageChart = oneRM ? getPercentageChart(oneRM) : null

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-display text-iron-100">Tools</h1>
        <p className="text-iron-500 text-sm mt-1">
          Training calculators and utilities
        </p>
      </div>

      {/* 1RM Calculator */}
      <div className="card-steel rounded-xl overflow-hidden">
        <div className="p-4 border-b border-iron-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-flame-500/20 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-flame-400" />
          </div>
          <div>
            <h2 className="font-display text-lg text-iron-100">1RM Calculator</h2>
            <p className="text-iron-500 text-sm">Estimate your one-rep max</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Exercise Selection */}
          <div>
            <label className="block text-sm font-medium text-iron-300 mb-2">
              Exercise (optional)
            </label>
            <select
              value={exercise}
              onChange={(e) => setExercise(e.target.value)}
              className="input-field w-full text-base py-3"
            >
              <option value="">Select exercise...</option>
              {COMMON_EXERCISES.map(ex => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
          </div>

          {/* Weight and Reps */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-iron-300 mb-2">
                Weight (lbs)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="225"
                className="input-field w-full text-base py-3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-iron-300 mb-2">
                Reps Completed
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="5"
                min="1"
                max="30"
                className="input-field w-full text-base py-3"
              />
            </div>
          </div>

          {/* Formula Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-iron-300">
                Formula
              </label>
              <button
                onClick={() => setShowFormulaInfo(!showFormulaInfo)}
                className="text-iron-500 hover:text-iron-300 transition-colors"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(FORMULAS).map(([key, { name }]) => (
                <button
                  key={key}
                  onClick={() => setFormula(key)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    formula === key
                      ? 'bg-flame-500 text-white'
                      : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
            {showFormulaInfo && (
              <p className="text-xs text-iron-500 mt-2">
                {FORMULAS[formula].description}
              </p>
            )}
          </div>

          {/* Result */}
          {oneRM && (
            <div className="mt-6 p-6 bg-gradient-to-br from-flame-500/20 to-flame-600/10 rounded-xl text-center">
              <p className="text-iron-400 text-sm mb-1">
                {exercise || 'Estimated'} 1RM
              </p>
              <p className="text-4xl font-display text-flame-400">
                {Math.round(oneRM)} <span className="text-xl text-iron-400">lbs</span>
              </p>
              <p className="text-iron-500 text-sm mt-2">
                Based on {weight} lbs × {reps} reps
              </p>
            </div>
          )}

          {/* Percentage Chart */}
          {percentageChart && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-iron-300 mb-3">
                Training Weights
              </h3>
              <div className="bg-iron-800/50 rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 gap-px bg-iron-700 text-xs font-medium text-iron-400">
                  <div className="bg-iron-800 p-2 text-center">Reps</div>
                  <div className="bg-iron-800 p-2 text-center">% of 1RM</div>
                  <div className="bg-iron-800 p-2 text-center">Weight</div>
                </div>
                {percentageChart.map(({ reps, percent, weight }) => (
                  <div 
                    key={reps} 
                    className={`grid grid-cols-3 gap-px text-sm ${
                      reps === 1 ? 'bg-flame-500/10' : ''
                    }`}
                  >
                    <div className={`p-2 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-300'}`}>
                      {reps}
                    </div>
                    <div className={`p-2 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-400'}`}>
                      {percent}%
                    </div>
                    <div className={`p-2 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-200'}`}>
                      {Math.round(weight)} lbs
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-iron-600 mt-2 text-center">
                Use these percentages to plan your working sets
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Placeholder for future tools */}
      <div className="mt-6 card-steel rounded-xl p-6 text-center">
        <Dumbbell className="w-10 h-10 text-iron-700 mx-auto mb-2" />
        <p className="text-iron-500 text-sm">More tools coming soon</p>
      </div>
    </div>
  )
}