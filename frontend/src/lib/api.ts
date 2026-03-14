import axios from 'axios';

// Dynamic API URL: when accessed via network IP (e.g., phone), use that same hostname
// This allows the frontend to work from localhost AND from network IPs like 192.168.x.x
function getApiBaseUrl(): string {
  // If VITE_API_URL is explicitly set, use it
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL}/api`;
  }
  
  // Otherwise, dynamically detect based on access method
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  
  console.log('🌐 Detecting API URL from hostname:', hostname);
  
  // Special case 1: WiFi hotspot network (192.168.137.x)
  // When phone connects via laptop's hotspot
  if (hostname.startsWith('192.168.137.')) {
    console.log('📱 Hotspot network detected - using same IP for backend');
    return `${protocol}//${hostname}:5000/api`;
  }
  
  // Default: localhost or any LAN IP, use same hostname
  return `${protocol}//${hostname}:5000/api`;
}

export const API_BASE_URL = getApiBaseUrl();

// Also export just the server origin (for non-/api paths like profile pictures, Google OAuth)
export const API_ORIGIN = API_BASE_URL.replace('/api', '');

// Debug: Log the API URL being used
console.log('🌐 API Base URL:', API_BASE_URL);
console.log('🔧 Hostname:', window.location.hostname);

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
    const token = localStorage.getItem('lush_token');
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

    if (status === 401 && hasAuthHeader && !isPublicAuthRoute) {
      // Token expired or invalid
      localStorage.removeItem('lush_token');
      localStorage.removeItem('lush_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
