import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse, RawAxiosResponseHeaders } from 'axios';

const API_CACHE_PREFIX = 'hommiez-api-cache:';
const API_CACHE_TTL_MS = 30000;
const POST_LOGIN_REDIRECT_KEY = 'hommiez_post_login_redirect';

type CachedApiResponse = {
  data: unknown;
  status: number;
  statusText: string;
  headers: unknown;
  timestamp: number;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

function getRequestCacheKey(config: AxiosRequestConfig) {
  const token = localStorage.getItem('hommiez_token') || 'anonymous';
  const method = String(config.method || 'get').toLowerCase();
  const url = String(config.url || '');
  const params = stableStringify(config.params || {});
  const data = stableStringify(config.data || {});
  return `${API_CACHE_PREFIX}${token}:${method}:${url}:${params}:${data}`;
}

function readApiCache(key: string): CachedApiResponse | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedApiResponse;
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > API_CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeApiCache(key: string, response: AxiosResponse<unknown>) {
  try {
    const cacheEntry: CachedApiResponse = {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(key, JSON.stringify(cacheEntry));
  } catch {
    // Ignore cache write failures and fall back to live requests.
  }
}

function clearApiCache() {
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key && key.startsWith(API_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Ignore storage errors.
  }
}

function storePostLoginRedirect() {
  if (typeof window === 'undefined') return;

  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (!currentPath || currentPath === '/login' || currentPath === '/create-account' || currentPath === '/forgot-password') {
    return;
  }

  sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, currentPath);
  sessionStorage.setItem('hommiez_post_login_redirect_reason', 'auth-interruption');
}

// Global axios interceptor to handle authentication errors
export const setupAxiosInterceptors = () => {
  axios.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('hommiez_token');
      if (token) {
        const lowercaseHeaders = config.headers as Record<string, unknown> | undefined;
        const existingAuth =
          config.headers?.Authorization ||
          lowercaseHeaders?.authorization;

        if (!existingAuth) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
        }
      }

      const method = String(config.method || 'get').toLowerCase();
      const requestUrl = String(config.url || '');
      const isGetRequest = method === 'get';
      const isBlobRequest = config.responseType === 'blob' || config.responseType === 'arraybuffer';

      if (isGetRequest && !isBlobRequest) {
        const cacheKey = getRequestCacheKey(config);
        const cachedResponse = readApiCache(cacheKey);

        if (cachedResponse) {
          config.adapter = async () => ({
            data: cachedResponse.data,
            status: cachedResponse.status,
            statusText: cachedResponse.statusText,
            headers: cachedResponse.headers as RawAxiosResponseHeaders,
            config,
            request: {},
          });
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
      const method = String(error.config?.method || 'get').toLowerCase();
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
        storePostLoginRedirect();
        localStorage.removeItem('hommiez_token');
        localStorage.removeItem('hommiez_user');
        clearApiCache();
        
        // Redirect to login page
        window.location.href = '/login';
        
        return Promise.reject(error);
      }
      
      if (method !== 'get') {
        clearApiCache();
      }

      return Promise.reject(error);
    }
  );

  axios.interceptors.response.use((response) => {
    const method = String(response.config?.method || 'get').toLowerCase();
    const isGetRequest = method === 'get';
    const isBlobRequest = response.config?.responseType === 'blob' || response.config?.responseType === 'arraybuffer';

    if (isGetRequest && !isBlobRequest) {
      const cacheKey = getRequestCacheKey(response.config);
      writeApiCache(cacheKey, response);
    }

    return response;
  });
};
