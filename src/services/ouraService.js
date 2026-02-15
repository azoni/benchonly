import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getAuthHeaders } from './api';
import { apiUrl } from '../utils/platform'

export const ouraService = {
  /**
   * Get Oura integration status and cached data from Firestore.
   */
  async getStatus(userId) {
    const ref = doc(db, 'users', userId, 'integrations', 'oura');
    const snap = await getDoc(ref);
    if (!snap.exists()) return { connected: false };
    const data = snap.data();
    return {
      connected: data.status === 'connected',
      status: data.status,
      connectedAt: data.connectedAt,
      lastSynced: data.lastSynced,
      data: data.data || null,
    };
  },

  /**
   * Initiate Oura OAuth flow — gets the auth URL from serverless function.
   */
  async connect() {
    const headers = await getAuthHeaders();
    const response = await fetch(apiUrl('oura-auth'), {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to initiate Oura connection');
    }
    const { authUrl } = await response.json();
    return authUrl;
  },

  /**
   * Sync latest data from Oura API.
   */
  async sync() {
    const headers = await getAuthHeaders();
    const response = await fetch(apiUrl('oura-sync'), {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to sync Oura data');
    }
    return response.json();
  },

  /**
   * Disconnect Oura integration.
   */
  async disconnect(userId) {
    const ref = doc(db, 'users', userId, 'integrations', 'oura');
    await deleteDoc(ref);
  },

  /**
   * Get the latest scores for AI context (returns null if not connected).
   */
  async getLatestScores(userId) {
    const status = await this.getStatus(userId);
    if (!status.connected || !status.data) return null;

    const { sleep, readiness, activity } = status.data;

    // Get most recent day's data
    const latestSleep = sleep?.length ? sleep[sleep.length - 1] : null;
    const latestReadiness = readiness?.length ? readiness[readiness.length - 1] : null;
    const latestActivity = activity?.length ? activity[activity.length - 1] : null;

    // Calculate 7-day averages
    const avgSleep = sleep?.length
      ? Math.round(sleep.reduce((s, d) => s + (d.score || 0), 0) / sleep.length)
      : null;
    const avgReadiness = readiness?.length
      ? Math.round(readiness.reduce((s, d) => s + (d.score || 0), 0) / readiness.length)
      : null;

    return {
      latest: {
        sleep: latestSleep,
        readiness: latestReadiness,
        activity: latestActivity,
      },
      averages: {
        sleepScore: avgSleep,
        readinessScore: avgReadiness,
      },
    };
  },
};
