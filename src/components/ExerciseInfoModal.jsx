import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, ArrowRightLeft, ListChecks } from 'lucide-react';

export default function ExerciseInfoModal({ exercise, isOpen, onClose }) {
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
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:w-full z-50"
          >
            <div className="bg-iron-900 rounded-t-2xl md:rounded-2xl border border-iron-800 shadow-2xl max-h-[80vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 p-4 border-b border-iron-800">
                <div className="w-10 h-10 rounded-xl bg-flame-500/15 flex items-center justify-center flex-shrink-0">
                  <ListChecks className="w-5 h-5 text-flame-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-iron-100 truncate">{exercise.name}</h3>
                  {exercise.type && exercise.type !== 'weight' && (
                    <span className="text-xs text-iron-500 capitalize">{exercise.type}</span>
                  )}
                </div>
                <button onClick={onClose} className="p-2 text-iron-500 hover:text-iron-300 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {exercise.howTo && (
                  <div>
                    <h4 className="text-xs text-iron-500 uppercase tracking-wider mb-2">How To Perform</h4>
                    <p className="text-sm text-iron-300 leading-relaxed">{exercise.howTo}</p>
                  </div>
                )}

                {exercise.cues?.length > 0 && (
                  <div>
                    <h4 className="text-xs text-iron-500 uppercase tracking-wider mb-2">Key Cues</h4>
                    <ul className="space-y-1.5">
                      {exercise.cues.map((cue, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-iron-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-flame-400 mt-1.5 flex-shrink-0" />
                          {cue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {exercise.substitutions?.length > 0 && (
                  <div>
                    <h4 className="text-xs text-iron-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      Substitutions
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {exercise.substitutions.map((sub, i) => (
                        <span key={i} className="px-3 py-1.5 bg-iron-800 border border-iron-700 rounded-lg text-sm text-iron-300">
                          {sub}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {exercise.notes && (
                  <div>
                    <h4 className="text-xs text-iron-500 uppercase tracking-wider mb-2">Coach Notes</h4>
                    <p className="text-sm text-iron-400 leading-relaxed">{exercise.notes}</p>
                  </div>
                )}

                {!hasInfo && !exercise.notes && (
                  <p className="text-sm text-iron-500 text-center py-4">
                    No instructions available for this exercise.
                  </p>
                )}
              </div>

              {/* Watch Video Button */}
              <div className="p-4 border-t border-iron-800">
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Watch Video Tutorial
                </a>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
