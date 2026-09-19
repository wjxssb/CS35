import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api('/api/me');
      setUser(user);
      return user;
    } catch (e) {
      if (e.status !== 401) console.warn('me fetch failed:', e.message);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (identifier, password) => {
    const data = await api('/api/auth/login', { method: 'POST', body: { identifier, password } });
    await refresh();
    return data;
  }, [refresh]);

  const register = useCallback(async (username, email, password) => {
    const data = await api('/api/auth/register', { method: 'POST', body: { username, email, password } });
    await refresh();
    return data;
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refresh, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
