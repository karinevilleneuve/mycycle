// src/services/api.js — all API calls to the backend
const API_URL = import.meta.env.VITE_API_URL || '/api';

// ─── Token helpers ────────────────────────────────────────────────────────────
// The token is stored in localStorage so it persists across browser sessions.
// The user stays logged in for 30 days without needing to re-enter their password.

export const auth = {
  getToken:    ()      => localStorage.getItem('authToken'),
  getUsername: ()      => localStorage.getItem('authUsername'),
  setSession:  (token, username) => {
    localStorage.setItem('authToken',    token);
    localStorage.setItem('authUsername', username);
  },
  clearSession: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUsername');
  },
  isLoggedIn: () => !!localStorage.getItem('authToken'),
};

// ─── Shared fetch helper ──────────────────────────────────────────────────────
// Adds the Authorization header to every request automatically.
// If the server returns 401 (token expired/invalid), clears the session
// so the login screen appears automatically.
async function apiFetch(path, options = {}) {
  const token = auth.getToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  // If token is invalid/expired, clear session so login screen appears
  if (response.status === 401) {
    auth.clearSession();
    window.location.reload(); // triggers login screen in App.jsx
    return null;
  }

  return response;
}

// ─── API methods ──────────────────────────────────────────────────────────────

export const api = {

  // Log in — returns { token, username } on success, throws on failure
  async login(username, password) {
    const response = await fetch(`${API_URL}/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed');
    auth.setSession(data.token, data.username);
    return data;
  },

  // Log out — clears token on server and locally
  async logout() {
    try {
      await apiFetch('/logout', { method: 'POST' });
    } finally {
      auth.clearSession();
    }
  },

  // Change password
  async changePassword(currentPassword, newPassword) {
    const response = await apiFetch('/change-password', {
      method: 'POST',
      body:   JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to change password');
    return data;
  },

  // Get all data for the logged-in user
  async getAllData() {
    try {
      const response = await apiFetch('/data');
      if (!response || !response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error fetching data:', error);
      return null;
    }
  },

  // Save all data for the logged-in user
  async saveAllData(data) {
    try {
      const response = await apiFetch('/data', {
        method: 'POST',
        body:   JSON.stringify(data),
      });
      if (!response) return null;
      return await response.json();
    } catch (error) {
      console.error('Error saving data:', error);
      return null;
    }
  },

  // Save period dates only
  async savePeriods(periodDates) {
    try {
      const response = await apiFetch('/periods', {
        method: 'POST',
        body:   JSON.stringify({ periodDates }),
      });
      if (!response) return null;
      return await response.json();
    } catch (error) {
      console.error('Error saving periods:', error);
      return null;
    }
  },

  // Save symptoms only
  async saveSymptoms(symptoms) {
    try {
      const response = await apiFetch('/symptoms', {
        method: 'POST',
        body:   JSON.stringify({ symptoms }),
      });
      if (!response) return null;
      return await response.json();
    } catch (error) {
      console.error('Error saving symptoms:', error);
      return null;
    }
  },

  // Save IUD date
  async saveIUD(iudInsertionDate) {
    try {
      const response = await apiFetch('/iud', {
        method: 'POST',
        body:   JSON.stringify({ iudInsertionDate }),
      });
      if (!response) return null;
      return await response.json();
    } catch (error) {
      console.error('Error saving IUD date:', error);
      return null;
    }
  },

  // Export as CSV (opens in new tab)
  exportCSV() {
    const token = auth.getToken();
    window.open(`${API_URL}/export/csv?token=${token}`, '_blank');
  },
};
