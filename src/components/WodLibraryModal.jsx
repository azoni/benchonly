import { useState, useMemo } from 'react'
import { X, Search, ChevronLeft, Clock, Repeat2, Trophy, History } from 'lucide-react'
import { WOD_LIBRARY, ALL_FOCUS_TAGS, FORMAT_LABELS, FORMAT_COLORS } from '../data/wodLibrary'

const VARIANT_KEYS = ['rxMen', 'rxWomen', 'scaledMen', 'scaledWomen']

function formatResult(result, format) {
  if (!result) return null
  if (format === 'amrap') {
    const parts = []
    if (result.rounds != null) parts.push(`${result.rounds} rds`)
    if (result.extraReps != null) parts.push(`+${result.extraReps}`)
    return parts.join(' ') || null
  }
  return result.time || null
}

export default function WodLibraryModal({ isOpen, onClose, onSelect, userWodStats = {} }) {
  const [search, setSearch] = useState('')
  const [focusFilter, setFocusFilter] = useState(null)
  const [selectedWod, setSelectedWod] = useState(null)
  const [selectedVariant, setSelectedVariant] = useState('rxMen')

  const filtered = useMemo(() => {
    let list = WOD_LIBRARY
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(w => w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q))
    }
    if (focusFilter) {
      list = list.filter(w => w.focus.includes(focusFilter))
    }
    return list
  }, [search, focusFilter])

  function openWod(wod) {
    setSelectedWod(wod)
    setSelectedVariant('rxMen')
  }

  function handleUseWod() {
    if (!selectedWod) return
    onSelect(selectedWod, selectedVariant)
  }

  function handleClose() {
    setSearch('')
    setFocusFilter(null)
    setSelectedWod(null)
    onClose()
  }

  if (!isOpen) return null

  const stats = selectedWod ? userWodStats[selectedWod.id] : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-iron-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3 border-b border-iron-800">
        {selectedWod ? (
          <button
            onClick={() => setSelectedWod(null)}
            className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleClose}
            className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-iron-50">
            {selectedWod ? selectedWod.name : 'WOD Library'}
          </h2>
          {!selectedWod && (
            <p className="text-xs text-iron-500">{WOD_LIBRARY.length} benchmark WODs</p>
          )}
        </div>
        {selectedWod && (
          <button
            onClick={handleUseWod}
            className="btn-primary px-4 py-2 text-sm"
          >
            Use This WOD
          </button>
        )}
      </div>

      {selectedWod ? (
        /* ── WOD Detail View ── */
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-5 max-w-2xl mx-auto">
            {/* Format + Focus */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${FORMAT_COLORS[selectedWod.format]}`}>
                {FORMAT_LABELS[selectedWod.format]}
                {selectedWod.timeCap && ` · ${selectedWod.timeCap} min`}
              </span>
              {selectedWod.focus.map(f => (
                <span key={f} className="px-2 py-0.5 rounded-full text-xs bg-iron-800 text-iron-400 capitalize">{f}</span>
              ))}
            </div>

            {/* Description */}
            <p className="text-sm text-iron-300 leading-relaxed mb-5">{selectedWod.description}</p>

            {/* Target benchmarks */}
            <div className="card-steel p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-iron-500" />
                <span className="text-xs font-semibold text-iron-400 uppercase tracking-wide">
                  {selectedWod.format === 'amrap' ? 'Score Benchmarks' : 'Time Benchmarks'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Elite', value: selectedWod.targetTime.elite, color: 'text-flame-400' },
                  { label: 'Intermediate', value: selectedWod.targetTime.intermediate, color: 'text-yellow-400' },
                  { label: 'Beginner', value: selectedWod.targetTime.beginner, color: 'text-iron-300' },
                ].map(t => (
                  <div key={t.label} className="text-center">
                    <p className={`text-sm font-bold ${t.color}`}>{t.value}</p>
                    <p className="text-[10px] text-iron-600 mt-0.5">{t.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Your stats */}
            {stats && (
              <div className="card-steel p-4 mb-5 bg-flame-500/5 border-flame-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="w-4 h-4 text-flame-400" />
                  <span className="text-xs font-semibold text-flame-400 uppercase tracking-wide">Your Stats</span>
                </div>
                {stats.pr && (
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-iron-300">Personal Record</span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-flame-400">{formatResult(stats.pr, selectedWod.format)}</span>
                      {stats.pr.variant && (
                        <span className="block text-[10px] text-iron-600">{stats.pr.variant}</span>
                      )}
                    </div>
                  </div>
                )}
                {stats.history?.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 mb-2">
                      <History className="w-3.5 h-3.5 text-iron-500" />
                      <span className="text-[10px] text-iron-500 uppercase tracking-wide">History</span>
                    </div>
                    <div className="space-y-1.5">
                      {stats.history.slice(0, 5).map((entry, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-iron-500">{entry.date}</span>
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${entry.rxOrScaled === 'rx' ? 'bg-flame-500/20 text-flame-400' : 'bg-iron-800 text-iron-400'}`}>
                              {entry.rxOrScaled === 'rx' ? 'Rx' : 'Scaled'}
                            </span>
                            <span className="text-iron-300 font-medium">{formatResult(entry, selectedWod.format)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Variant selector */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-iron-400 uppercase tracking-wide mb-2">Select Variant</p>
              <div className="grid grid-cols-2 gap-2">
                {VARIANT_KEYS.filter(k => selectedWod.variants[k]).map(key => (
                  <button
                    key={key}
                    onClick={() => setSelectedVariant(key)}
                    className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                      selectedVariant === key
                        ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                        : 'border-iron-700 text-iron-400 hover:border-iron-600'
                    }`}
                  >
                    <span className="text-xs font-medium">{selectedWod.variants[key].label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Movements for selected variant */}
            {selectedWod.variants[selectedVariant] && (
              <div className="card-steel p-4 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Repeat2 className="w-4 h-4 text-iron-500" />
                  <span className="text-xs font-semibold text-iron-400 uppercase tracking-wide">
                    {selectedWod.variants[selectedVariant].label} — Movements
                  </span>
                </div>
                <div className="space-y-2">
                  {selectedWod.variants[selectedVariant].movements.map((m, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-iron-200 font-medium">{m.name}</span>
                      <div className="flex items-center gap-2 text-right">
                        {m.weight && <span className="text-xs text-iron-500">{m.weight}</span>}
                        <span className="text-sm font-bold text-iron-100">{m.reps}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Use WOD button (bottom) */}
            <button
              onClick={handleUseWod}
              className="btn-primary w-full py-3"
            >
              Use This WOD
            </button>
          </div>
        </div>
      ) : (
        /* ── WOD Grid View ── */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search + Filter */}
          <div className="px-4 py-3 border-b border-iron-800/50 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search WODs..."
                className="input-field pl-9 w-full"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setFocusFilter(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  !focusFilter ? 'bg-iron-700 text-iron-100' : 'bg-iron-800/50 text-iron-400 hover:bg-iron-800'
                }`}
              >
                All
              </button>
              {ALL_FOCUS_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => setFocusFilter(focusFilter === tag ? null : tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 capitalize ${
                    focusFilter === tag ? 'bg-flame-500 text-white' : 'bg-iron-800/50 text-iron-400 hover:bg-iron-800'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* WOD Grid */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-iron-500 text-sm">No WODs match your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.map(wod => {
                  const myStats = userWodStats[wod.id]
                  const pr = myStats?.pr ? formatResult(myStats.pr, wod.format) : null
                  return (
                    <button
                      key={wod.id}
                      onClick={() => openWod(wod)}
                      className="card-steel p-4 text-left hover:border-iron-600 transition-all hover:bg-iron-800/60 active:scale-[0.98]"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-bold text-iron-100">{wod.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${FORMAT_COLORS[wod.format]}`}>
                          {FORMAT_LABELS[wod.format]}
                          {wod.timeCap && ` ${wod.timeCap}m`}
                        </span>
                      </div>
                      <p className="text-xs text-iron-500 line-clamp-2 mb-3">{wod.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {wod.focus.slice(0, 3).map(f => (
                            <span key={f} className="px-1.5 py-0.5 rounded text-[10px] bg-iron-800 text-iron-500 capitalize">{f}</span>
                          ))}
                        </div>
                        {pr && (
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <Trophy className="w-3 h-3 text-flame-400" />
                            <span className="text-[10px] font-bold text-flame-400">{pr}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
