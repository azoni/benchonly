import { tokenUsageService } from './firestore';
import { getAuth } from 'firebase/auth';

import { API_BASE } from '../utils/platform';

/**
 * Get Authorization headers with Firebase ID token.
 * Import this from any component that calls serverless functions directly.
 */
export async function getAuthHeaders() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

class APIService {
  constructor() {
    this.baseUrl = API_BASE;
  }

  async generateWorkout(params) {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/generate-workout`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error('Failed to generate workout');
      }

      const data = await response.json();
      
      // Log token usage to Firestore
      if (data.usage) {
        tokenUsageService.log(data.usage).catch(console.error);
      }

      return data;
    } catch (error) {
      console.error('Generate workout error:', error);
      throw error;
    }
  }

  async askAssistant(message, context = {}, mode = null) {
    try {
      const headers = await getAuthHeaders();
      const body = { message, context };
      if (mode) body.mode = mode;
      const response = await fetch(`${this.baseUrl}/ask-assistant`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      // Log token usage to Firestore
      if (data.usage) {
        tokenUsageService.log(data.usage).catch(console.error);
      }

      return data;
    } catch (error) {
      console.error('Ask assistant error:', error);
      throw error;
    }
  }

  async autofillWorkout(workoutId, partialData) {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/autofill-workout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workoutId, partialData }),
      });

      if (!response.ok) {
        throw new Error('Failed to autofill workout');
      }

      const data = await response.json();
      
      // Log token usage to Firestore
      if (data.usage) {
        tokenUsageService.log(data.usage).catch(console.error);
      }

      return data;
    } catch (error) {
      console.error('Autofill workout error:', error);
      throw error;
    }
  }

  async analyzeProgress(userId, liftType, timeRange) {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/analyze-progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ liftType, timeRange }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze progress');
      }

      const data = await response.json();
      
      // Log token usage to Firestore
      if (data.usage) {
        tokenUsageService.log(data.usage).catch(console.error);
      }

      return data;
    } catch (error) {
      console.error('Analyze progress error:', error);
      throw error;
    }
  }

  async askAssistantStream(message, context = {}, onDelta, onComplete, onError) {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/ask-assistant-stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, context }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Stream failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              onError(data.error);
            } else if (data.done) {
              if (data.usage) {
                tokenUsageService.log(data.usage).catch(console.error);
              }
              onComplete(data);
            } else if (data.delta) {
              onDelta(data.delta);
            }
          } catch {}
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      onError(error.message || 'Stream failed');
    }
  }

  // Get token usage from Firestore
  async getTokenUsage() {
    return tokenUsageService.getSummary();
  }
}

export const api = new APIService();

// Named exports for convenience
export const generateWorkout = (params) => api.generateWorkout(params);
export const askAssistant = (message, context) => api.askAssistant(message, context);
export const autofillWorkout = (workoutId, partialData) => api.autofillWorkout(workoutId, partialData);
export const analyzeProgress = (userId, liftType, timeRange) => api.analyzeProgress(userId, liftType, timeRange);
export const getTokenUsage = () => api.getTokenUsage();

export default api;