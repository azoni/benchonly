import { tokenUsageService } from './firestore';
import { getAuth } from 'firebase/auth';

const API_BASE = '/.netlify/functions';

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