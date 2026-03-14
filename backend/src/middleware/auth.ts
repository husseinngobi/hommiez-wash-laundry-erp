import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UserRole } from '../models/User';
import { isSystemAdminEmail } from '../utils/systemAdmin';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    full_name: string;
    role: UserRole;
    is_system_admin?: boolean;
  };
  file?: Express.Multer.File;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      
      // Debug logging
      console.log('🔍 JWT Token Decoded:', {
        hasId: 'id' in decoded,
        hasUserId: 'userId' in decoded,
        id: decoded.id,
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role
      });
      
      // Handle both old (userId) and new (id) token formats for backward compatibility
      const userId = decoded.id || decoded.userId;
      
      if (!userId) {
        console.error('❌ No user ID found in token');
        return res.status(401).json({ error: 'Invalid token format' });
      }
      
      req.user = {
        id: userId,
        email: decoded.email,
        full_name: decoded.full_name,
        role: decoded.role,
        is_system_admin: decoded.is_system_admin ?? isSystemAdminEmail(decoded.email)
      };
      
      next();
    } catch (error) {
      console.error('❌ Token verification failed:', error);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.role 
      });
    }
    
    next();
  };
};

// Middleware to require admin role
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  if (req.user.role !== UserRole.ADMIN) {
    return res.status(403).json({ 
      error: 'Access denied. Administrator role required.',
      current: req.user.role 
    });
  }
  
  next();
};

export const requireSystemAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.user.role !== UserRole.ADMIN || !req.user.is_system_admin) {
    return res.status(403).json({
      error: 'Access denied. Systems Administrator privileges required.',
      current: req.user.role,
    });
  }

  next();
};

// Middleware to require admin or manager role
export const requireAdminOrManager = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  if (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.MANAGER) {
    return res.status(403).json({ 
      error: 'Access denied. Administrator or Manager role required.',
      current: req.user.role 
    });
  }
  
  next();
};
