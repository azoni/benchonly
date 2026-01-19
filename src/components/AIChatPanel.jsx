import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, Sparkles, Bot, User } from 'lucide-react';
import { useUIStore } from '../store';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function AIChatPanel() {
  const { chatOpen, setChatOpen } = useUIStore();
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hey! I'm your workout assistant. Ask me about your workouts, goals, or let me help you plan your next session.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (chatOpen) {
      inputRef.current?.focus();
    }
  }, [chatOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await api.askAssistant(userMessage, {
        userId: user?.uid,
        // Add more context as needed
      });

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.message },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I couldn't process that. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    "What's my workout today?",
    "Show my progress this week",
    "Suggest weights for bench",
    "Why rest days matter?",
  ];

  return (
    <AnimatePresence>
      {chatOpen && (
        <>
          {/* Backdrop for mobile */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setChatOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Chat Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 lg:inset-auto lg:bottom-6 lg:right-6 lg:w-96 lg:h-[600px]
              bg-iron-900 border border-iron-700/50 rounded-2xl z-50
              flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-iron-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-flame-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-flame-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-iron-100">AI Assistant</h3>
                  <p className="text-xs text-iron-500">Always here to help</p>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="p-2 text-iron-400 hover:text-iron-100 hover:bg-iron-800
                  rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                      ${message.role === 'user'
                        ? 'bg-flame-500'
                        : 'bg-iron-800 border border-iron-700'
                      }`}
                  >
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-flame-400" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm
                      ${message.role === 'user'
                        ? 'bg-flame-500 text-white rounded-tr-md'
                        : 'bg-iron-800 text-iron-100 rounded-tl-md'
                      }`}
                  >
                    {message.content}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-iron-800 border border-iron-700
                    flex items-center justify-center">
                    <Bot className="w-4 h-4 text-flame-400" />
                  </div>
                  <div className="bg-iron-800 px-4 py-3 rounded-2xl rounded-tl-md">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-iron-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-iron-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-iron-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            {messages.length <= 2 && (
              <div className="px-4 pb-2">
                <p className="text-xs text-iron-500 mb-2">Quick actions</p>
                <div className="flex flex-wrap gap-2">
                  {quickActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => setInput(action)}
                      className="px-3 py-1.5 text-xs bg-iron-800 text-iron-300
                        border border-iron-700 rounded-full
                        hover:border-flame-500/50 hover:text-iron-100
                        transition-colors"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="p-4 border-t border-iron-800"
            >
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your workouts..."
                  className="flex-1 bg-iron-800 text-iron-100 px-4 py-2.5 rounded-full
                    border border-iron-700 focus:border-flame-500/50 focus:outline-none
                    placeholder:text-iron-500 text-sm"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="w-10 h-10 rounded-full bg-flame-500 text-white
                    flex items-center justify-center
                    hover:bg-flame-400 disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
