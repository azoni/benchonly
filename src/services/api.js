const API_BASE = '/.netlify/functions';

class APIService {
  constructor() {
    this.baseUrl = API_BASE;
  }

  async generateWorkout(params) {
    try {
      const response = await fetch(`${this.baseUrl}/generate-workout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error('Failed to generate workout');
      }

      return await response.json();
    } catch (error) {
      console.error('Generate workout error:', error);
      throw error;
    }
  }

  async askAssistant(message, context = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/ask-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, context }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      // Log token usage
      if (data.usage) {
        this.logTokenUsage(data.usage).catch(console.error);
      }

      return data;
    } catch (error) {
      console.error('Ask assistant error:', error);
      throw error;
    }
  }

  async logTokenUsage(usage) {
    try {
      await fetch(`${this.baseUrl}/token-usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(usage),
      });
    } catch (error) {
      console.error('Log token usage error:', error);
    }
  }

  async autofillWorkout(workoutId, partialData) {
    try {
      const response = await fetch(`${this.baseUrl}/autofill-workout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workoutId, partialData }),
      });

      if (!response.ok) {
        throw new Error('Failed to autofill workout');
      }

      return await response.json();
    } catch (error) {
      console.error('Autofill workout error:', error);
      throw error;
    }
  }

  async analyzeProgress(userId, liftType, timeRange) {
    try {
      const response = await fetch(`${this.baseUrl}/analyze-progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, liftType, timeRange }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze progress');
      }

      return await response.json();
    } catch (error) {
      console.error('Analyze progress error:', error);
      throw error;
    }
  }

  async getTokenUsage(filters = {}) {
    try {
      const params = new URLSearchParams(filters);
      const response = await fetch(`${this.baseUrl}/token-usage?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get token usage');
      }

      return await response.json();
    } catch (error) {
      console.error('Get token usage error:', error);
      throw error;
    }
  }
}

export const api = new APIService();

// Named exports for convenience
export const generateWorkout = (params) => api.generateWorkout(params);
export const askAssistant = (message, context) => api.askAssistant(message, context);
export const autofillWorkout = (workoutId, partialData) => api.autofillWorkout(workoutId, partialData);
export const analyzeProgress = (userId, liftType, timeRange) => api.analyzeProgress(userId, liftType, timeRange);
export const getTokenUsage = (filters) => api.getTokenUsage(filters);

export default api;