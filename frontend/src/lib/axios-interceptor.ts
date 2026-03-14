import axios from 'axios';

// Global axios interceptor to handle authentication errors
export const setupAxiosInterceptors = () => {
  axios.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('lush_token');
      if (token) {
        const existingAuth =
          config.headers?.Authorization ||
          (config.headers as any)?.authorization;

        if (!existingAuth) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
        }
      }

      return config;
    },
    (error) => Promise.reject(error)
  );

  axios.interceptors.response.use(
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

      // Only force logout when an authenticated request is rejected.
      if (status === 401 && hasAuthHeader && !isPublicAuthRoute) {
        // Clear stored authentication data
        localStorage.removeItem('lush_token');
        localStorage.removeItem('lush_user');
        
        // Redirect to login page
        window.location.href = '/login';
        
        return Promise.reject(error);
      }
      
      return Promise.reject(error);
    }
  );
};
