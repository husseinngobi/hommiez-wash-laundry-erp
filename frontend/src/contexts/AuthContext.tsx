import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import SessionTimeoutModal from '@/components/SessionTimeoutModal';
import SessionExpiredModal from '@/components/SessionExpiredModal';

interface User {
  id: number;
  email: string;
  full_name: string;
  phone?: string;
  role: 'ADMIN' | 'MANAGER' | 'DESKTOP_AGENT';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  is_system_admin?: boolean;
  profile_picture?: string;
  profile_picture_url?: string;
  session_timeout_minutes?: number;  // User's session timeout preference (5-30 minutes)
  must_change_password?: boolean;  // Flag to force password change on next login
  auth_provider?: 'LOCAL' | null;
  created_at?: string;
  updated_at?: string;
  last_login?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSystemAdmin: boolean;
  isManager: boolean;
  isCashier: boolean;
  canAccessUserManagement: boolean;
  canAccessSettings: boolean;
  canAccessReports: boolean;
  canAccessInventory: boolean;
  canDeleteCustomers: boolean;
  canEditPrices: boolean;
  canCancelOrders: boolean;
  canApproveExpenses: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updatedUser: User) => void;
  refreshUser: () => void;  // Reload user from localStorage
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Session timeout constants
const DEFAULT_INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const WARNING_TIME = 60 * 1000; // Show warning 60 seconds before timeout
const TOKEN_KEY = 'lush_token';
const USER_KEY = 'lush_user';
const SESSION_TIMEOUT_KEY = 'lush_session_timeout'; // Store user's preferred timeout

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [warningSeconds, setWarningSeconds] = useState(60);
  const navigate = useNavigate();
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);
  const warningTimer = useRef<NodeJS.Timeout | null>(null);

  // Get session timeout from user object (user preference or default)
  const getSessionTimeout = useCallback(() => {
    try {
      const userStr = localStorage.getItem(USER_KEY);
      if (userStr) {
        const user = JSON.parse(userStr);
        const timeoutMinutes = user.session_timeout_minutes || 15; // Default 15 minutes
        const timeoutMs = timeoutMinutes * 60 * 1000; // Convert to milliseconds
        return timeoutMs;
      }
    } catch (error) {
      // Failed to parse user object, use default
    }
    return DEFAULT_INACTIVITY_TIMEOUT;
  }, []);

  // Logout function (defined before resetInactivityTimer to avoid dependency issues)
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    // Clear dashboard period selections on logout
    localStorage.removeItem('dashboardPeriod');
    localStorage.removeItem('financialDashboardPeriod');
    
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
    }
    if (warningTimer.current) {
      clearTimeout(warningTimer.current);
    }
    
    setShowTimeoutWarning(false);
    setShowExpiredModal(false);
    navigate('/login');
  }, [navigate]);

  // Reset inactivity timer
  const resetInactivityTimer = useCallback(() => {
    // Clear existing timers
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
    }
    if (warningTimer.current) {
      clearTimeout(warningTimer.current);
    }
    
    // Hide warning if user becomes active
    if (showTimeoutWarning) {
      setShowTimeoutWarning(false);
    }
    
    if (token) {
      const timeout = getSessionTimeout();

      
      // Set warning timer (show warning before actual timeout)
      warningTimer.current = setTimeout(() => {
        setShowTimeoutWarning(true);
        setWarningSeconds(60);
      }, timeout - WARNING_TIME);
      
      // Set actual timeout timer
      inactivityTimer.current = setTimeout(() => {
        setShowTimeoutWarning(false);
        setShowExpiredModal(true);
        setTimeout(() => {
          logout();
        }, 3000); // Give user 3 seconds to see the message before redirecting
      }, timeout);
    }
  }, [token, logout, showTimeoutWarning, getSessionTimeout]);

  // Refresh user from localStorage (called after settings update)
  const refreshUser = useCallback(() => {
    try {
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        // Reset inactivity timer to use new timeout value
        resetInactivityTimer();
      }
    } catch (error) {
      // Failed to refresh user
    }
  }, [resetInactivityTimer]);

  // Track user activity
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, resetInactivityTimer);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetInactivityTimer);
      });
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
      }
    };
  }, [resetInactivityTimer]);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
        resetInactivityTimer();
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    
    setLoading(false);
  }, [resetInactivityTimer]);

  const login = async (email: string, password: string) => {
    try {
      const loginUrl = `${API_BASE_URL}/auth/login`;
      console.log('🔐 Login attempt to:', loginUrl);
      console.log('📱 Window location:', window.location.href);
      console.log('🌐 API_BASE_URL:', API_BASE_URL);
      
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      console.log('✅ Login response status:', response.status);
      const data = await response.json();
      console.log('📦 Login response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Save to state and localStorage
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      
      // Start inactivity timer
      resetInactivityTimer();

      // Check if password change is required
      if (data.user.must_change_password) {
        navigate('/change-password');
        return;
      }

      // Redirect to dashboard for all users
      navigate('/dashboard');
    } catch (error: unknown) {
      console.error('❌ Login error:', error);
      console.error('❌ Error type:', error instanceof Error ? 'Error' : typeof error);
      const message = error instanceof Error ? error.message : 'Login failed';
      console.error('❌ Error message:', message);
      throw new Error(message);
    }
  };

  // Modal handlers
  const handleStayLoggedIn = () => {
    setShowTimeoutWarning(false);
    resetInactivityTimer();
  };

  const handleTimeout = () => {
    setShowTimeoutWarning(false);
    setShowExpiredModal(true);
    setTimeout(() => {
      logout();
    }, 3000); // Give user 3 seconds to see the expired message before redirecting
  };

  const handleExpiredLogin = () => {
    setShowExpiredModal(false);
    navigate('/login');
  };

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
  }, []);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isAdmin: user?.role === 'ADMIN',
    isSystemAdmin: user?.role === 'ADMIN' && !!user?.is_system_admin,
    isManager: user?.role === 'MANAGER',
    isCashier: user?.role === 'DESKTOP_AGENT',
    canAccessUserManagement: user?.role === 'ADMIN',
    canAccessSettings: user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'DESKTOP_AGENT',
    canAccessReports: user?.role === 'ADMIN' || user?.role === 'MANAGER', // Admin and Manager can access reports
    canAccessInventory: user?.role === 'ADMIN',
    canDeleteCustomers: user?.role === 'ADMIN',
    canEditPrices: user?.role === 'ADMIN',
    canCancelOrders: user?.role === 'ADMIN',
    canApproveExpenses: user?.role === 'ADMIN',
    login,
    logout,
    updateUser,
    refreshUser,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SessionTimeoutModal
        isOpen={showTimeoutWarning}
        onClose={() => setShowTimeoutWarning(false)}
        onStayLoggedIn={handleStayLoggedIn}
        onTimeout={handleTimeout}
        remainingSeconds={warningSeconds}
      />
      <SessionExpiredModal
        isOpen={showExpiredModal}
        onLogin={handleExpiredLogin}
      />
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
