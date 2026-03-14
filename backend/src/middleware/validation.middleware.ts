import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

// Password strength validation regex
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// Email validation
export const validateEmail = body('email')
  .trim()
  .isEmail()
  .withMessage('Please provide a valid email address')
  .normalizeEmail()
  .isLength({ max: 255 })
  .withMessage('Email must not exceed 255 characters');

// Password validation with strength requirements
export const validatePassword = body('password')
  .trim()
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters long')
  .matches(PASSWORD_REGEX)
  .withMessage(
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
  );

// Full name validation
export const validateFullName = body('full_name')
  .trim()
  .isLength({ min: 2, max: 100 })
  .withMessage('Full name must be between 2 and 100 characters')
  .matches(/^[a-zA-Z\s'-]+$/)
  .withMessage('Full name can only contain letters, spaces, hyphens, and apostrophes')
  .escape(); // Prevent XSS

// Phone number validation (Uganda format: +256 7XX XXX XXX)
export const validatePhone = body('phone')
  .optional()
  .trim()
  .matches(/^\+256[0-9]{9}$/)
  .withMessage('Phone number must be in format +256XXXXXXXXX')
  .escape();

// Required phone validation for registration
export const validateRequiredPhone = body('phone')
  .trim()
  .notEmpty()
  .withMessage('Phone number is required')
  .matches(/^\+256[0-9]{9}$/)
  .withMessage('Phone number must be in format +256XXXXXXXXX')
  .escape();

// Login validation rules
export const loginValidation = [
  validateEmail,
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ max: 128 })
    .withMessage('Password is too long'),
];

// Registration validation rules
export const registerValidation = [
  validateEmail,
  validatePassword,
  validateFullName,
  validateRequiredPhone,
  body('role')
    .optional()
    .isIn(['ADMIN', 'MANAGER', 'DESKTOP_AGENT'])
    .withMessage('Role must be one of ADMIN, MANAGER, or DESKTOP_AGENT'),
];

// Password reset validation
export const forgotPasswordValidation = [validateEmail];

// Middleware to handle validation errors
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    return res.status(400).json({
      error: firstError.msg,
      field: firstError.type === 'field' ? (firstError as any).path : undefined,
    });
  }
  
  next();
};

// Export validation chains for different routes
export const authValidation = {
  login: [...loginValidation, handleValidationErrors],
  register: [...registerValidation, handleValidationErrors],
  forgotPassword: [...forgotPasswordValidation, handleValidationErrors],
};
