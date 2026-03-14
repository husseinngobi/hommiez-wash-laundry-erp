import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import { Request, Response, NextFunction } from 'express';

// Rate limiter for login attempts - prevents brute force attacks
export const loginLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 15, // Secondary IP-level protection (per-account DB lockout fires first at 5 attempts)
  message: {
    error: 'Too many login attempts from this IP address. Please wait 30 minutes before trying again.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
});

// General API rate limiter - prevents API abuse
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helmet configuration for security headers
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for React
      imgSrc: ["'self'", "data:", "https:", "http://localhost:5000"], // Allow images from backend
      connectSrc: ["'self'", "http://localhost:8080", "http://localhost:5000"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow loading resources
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resource loading
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny', // Prevent clickjacking
  },
  xssFilter: true, // Enable XSS filter
  noSniff: true, // Prevent MIME type sniffing
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
});

// HTTP Parameter Pollution protection
export const hppProtection = hpp();

// Custom middleware to hide server information
export const hideServerInfo = (req: Request, res: Response, next: NextFunction) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

// Middleware to extract real IP address (handles proxies)
export const extractRealIP = (req: Request, res: Response, next: NextFunction) => {
  // Get IP from various headers (in case of proxy/load balancer)
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIP = req.headers['x-real-ip'];
  
  // Store in a custom property to avoid read-only error
  if (typeof forwardedFor === 'string') {
    (req as any).clientIP = forwardedFor.split(',')[0].trim();
  } else if (typeof realIP === 'string') {
    (req as any).clientIP = realIP;
  } else {
    (req as any).clientIP = req.socket.remoteAddress || req.ip || 'unknown';
  }
  
  next();
};
