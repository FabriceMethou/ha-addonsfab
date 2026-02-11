// Authentication Context with JWT management
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthToken } from '../types';
import { authAPI } from '../services/api';
import { jwtDecode } from 'jwt-decode';

interface MfaPendingState {
  tempToken: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  mfaPending: MfaPendingState | null;
  login: (username: string, password: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  cancelMfa: () => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState<MfaPendingState | null>(null);

  useEffect(() => {
    // Check if user is logged in on mount
    const token = localStorage.getItem('access_token');
    const storedUser = localStorage.getItem('user');

    if (token && storedUser) {
      try {
        // Verify token is not expired
        const decoded: any = jwtDecode(token);
        const currentTime = Date.now() / 1000;

        if (decoded.exp > currentTime) {
          setUser(JSON.parse(storedUser));
        } else {
          // Access token expired — the interceptor will handle refresh on next API call
          // but if there's no refresh token either, clean up
          const refreshToken = localStorage.getItem('refresh_token');
          if (!refreshToken) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
          } else {
            // Keep user logged in — interceptor will refresh on first API call
            setUser(JSON.parse(storedUser));
          }
        }
      } catch (error) {
        console.error('Invalid token:', error);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
      }
    }

    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await authAPI.login(username, password);
      const data: AuthToken = response.data;

      // Check if MFA is required
      if (data.user.mfa_required) {
        // Store temp token and trigger MFA verification UI
        setMfaPending({ tempToken: data.access_token, username: data.user.username });
        return;
      }

      // Store tokens and user
      localStorage.setItem('access_token', data.access_token);
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  };

  const verifyMfa = async (code: string) => {
    if (!mfaPending) {
      throw new Error('No MFA verification pending');
    }

    try {
      const response = await authAPI.verifyMFA(mfaPending.tempToken, code);
      const data: AuthToken = response.data;

      // Store tokens and user
      localStorage.setItem('access_token', data.access_token);
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
      setMfaPending(null);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Invalid MFA code');
    }
  };

  const cancelMfa = () => {
    setMfaPending(null);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
    setMfaPending(null);
  };

  const value = {
    user,
    loading,
    mfaPending,
    login,
    verifyMfa,
    cancelMfa,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
