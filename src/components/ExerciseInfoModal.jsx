import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, ArrowRightLeft, RefreshCw } from 'lucide-react';

export default function ExerciseInfoModal({ exercise, isOpen, onClose, onSubstitute }) {
  if (!exercise) return null;

  const hasInfo = exercise.howTo || exercise.cues?.length > 0 || exercise.substitutions?.length > 0;
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.name + ' exercise form tutorial')}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 z-50"
          />

          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-sm md:w-full z-50"
          >
            <div className="bg-iron-900 rounded-t-2xl md:rounded-2xl border border-iron-800 shadow-2xl max-h-[70vh] flex flex-col">
              {/* Header — compact */}
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h3 className="text-base font-semibold text-iron-100 truncate flex-1 mr-2">{exercise.name}</h3>
                <button onClick={onClose} className="p-1.5 -mr-1 text-iron-500 hover:text-iron-300 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content — tight spacing */}
              <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
                {exercise.howTo && (
                  <p className="text-sm text-iron-300 leading-relaxed">{exercise.howTo}</p>
                )}

                {exercise.cues?.length > 0 && (
                  <ul className="space-y-1">
                    {exercise.cues.map((cue, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-iron-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-flame-400 mt-1.5 flex-shrink-0" />
                        {cue}
                      </li>
                    ))}
                  </ul>
                )}

                {exercise.substitutions?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ArrowRightLeft className="w-3 h-3 text-iron-500" />
                      <span className="text-xs text-iron-500 uppercase tracking-wider">
                        {onSubstitute ? 'Tap to swap' : 'Substitutions'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {exercise.substitutions.map((sub, i) => (
                        onSubstitute ? (
                          <button
                            key={i}
                            onClick={() => { onSubstitute(sub); onClose(); }}
                            className="px-2.5 py-1 bg-iron-800 border border-iron-700 rounded-lg text-xs text-iron-300 hover:border-flame-500/40 hover:text-flame-300 hover:bg-flame-500/10 transition-colors flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3 h-3" />
                            {sub}
                          </button>
                        ) : (
                          <span key={i} className="px-2.5 py-1 bg-iron-800 border border-iron-700 rounded-lg text-xs text-iron-300">
                            {sub}
                          </span>
                        )
                      ))}
                    </div>
                  </div>
                )}

                {exercise.notes && (
                  <p className="text-xs text-iron-500 leading-relaxed">{exercise.notes}</p>
                )}

                {!hasInfo && !exercise.notes && (
                  <p className="text-sm text-iron-500 text-center py-2">
                    Watch a tutorial to learn proper form for this exercise.
                  </p>
                )}
              </div>

              {/* Watch Video */}
              <div className="px-4 pb-4 pt-1">
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full flex items-center justify-center gap-2 text-sm py-2.5 px-4 rounded-xl transition-colors ${
                    hasInfo
                      ? 'bg-iron-800 border border-iron-700 text-iron-200 hover:bg-iron-700'
                      : 'bg-flame-500/15 border border-flame-500/30 text-flame-300 hover:bg-flame-500/25'
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Watch Tutorial
                </a>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
