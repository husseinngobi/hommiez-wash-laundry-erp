import axios from 'axios';

const configuredApiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

function getApiBaseUrl(): string {
  // Set VITE_API_URL to this deployment's backend origin. When omitted, use same-origin /api.
  return configuredApiUrl ? `${configuredApiUrl}/api` : '/api';
}

export const API_BASE_URL = getApiBaseUrl();

// Use the frontend origin in production so uploads and profile images can be proxied through the same site.
export const API_ORIGIN = configuredApiUrl || window.location.origin;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add JWT token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('hommiez_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = String(error.config?.url || '');
    const hasAuthHeader = Boolean(
      error.config?.headers?.Authorization ||
      error.config?.headers?.authorization
    );
    const isPublicAuthRoute =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/forgot-password');

    const storePostLoginRedirect = () => {
      if (typeof window === 'undefined') return;

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (!currentPath || currentPath === '/login' || currentPath === '/create-account' || currentPath === '/forgot-password') {
        return;
      }

      sessionStorage.setItem('hommiez_post_login_redirect', currentPath);
      sessionStorage.setItem('hommiez_post_login_redirect_reason', 'auth-interruption');
    };

    if (status === 401 && hasAuthHeader && !isPublicAuthRoute) {
      // Token expired or invalid
      storePostLoginRedirect();
      localStorage.removeItem('hommiez_token');
      localStorage.removeItem('hommiez_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
