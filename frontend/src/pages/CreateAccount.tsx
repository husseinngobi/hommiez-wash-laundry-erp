import { useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, User, ArrowLeft, CheckCircle2, Sparkles, Eye, EyeOff, Phone } from 'lucide-react';
import { validatePassword, getPasswordStrengthColor, getPasswordStrengthLabel } from '@/lib/passwordValidation';
import lushLogo from '@/assets/lush_logo.png';

export default function CreateAccount() {
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'DESKTOP_AGENT'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [emailError, setEmailError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailError('');

    // Validate email format strictly
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(formData.email)) {
      setEmailError('Please enter a valid email address');
      setError('Please enter a valid email address');
      return;
    }

    // Check for disposable/temporary email domains
    const disposableDomains = ['tempmail', 'throwaway', '10minute', 'guerrillamail', 'mailinator', 'yopmail', 'trashmail'];
    const emailDomain = formData.email.split('@')[1]?.toLowerCase();
    if (disposableDomains.some(d => emailDomain?.includes(d))) {
      setEmailError('Disposable email addresses are not allowed');
      setError('Please use a permanent email address (Gmail, Outlook, or company email)');
      return;
    }

    // Validate password strength
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      setPasswordErrors(passwordValidation.errors);
      setError('Please fix the password requirements below');
      return;
    }

    // Validate Uganda phone format
    const phoneRegex = /^\+256[0-9]{9}$/;
    if (!phoneRegex.test(formData.phone)) {
      setError('Phone number must be in format +256XXXXXXXXX');
      return;
    }

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: formData.fullName,
          phone: formData.phone,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create account');
      }

      setSuccess(true);
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create account. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear password errors when user types
    if (field === 'password') {
      setPasswordErrors([]);
      setError('');
    }
    
    // Real-time email validation
    if (field === 'email') {
      setEmailError('');
      setError('');
      
      if (value) {
        // Basic email format check
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(value)) {
          setEmailError('Please enter a valid email format');
        } else {
          // Check for disposable email domains
          const disposableDomains = ['tempmail', 'throwaway', '10minute', 'guerrillamail', 'mailinator', 'yopmail'];
          const domain = value.split('@')[1]?.toLowerCase();
          if (disposableDomains.some(d => domain?.includes(d))) {
            setEmailError('Disposable emails not allowed. Use Gmail, Outlook, or company email');
          }
        }
      }
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md shadow-2xl border-2">
          <CardContent className="pt-12 pb-12 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full mb-6">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Account Request Submitted!</h2>
            <p className="text-muted-foreground mb-4">
              Your account has been created and is pending approval from an administrator.
            </p>
            <p className="text-muted-foreground mb-6">
              The administrator will review your request, approve your account, and assign you an appropriate role (Administrator, Manager, or Desktop Agent) based on your responsibilities.
            </p>
            <p className="text-sm text-muted-foreground">
              Redirecting to login page...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-page-enter min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo and Brand */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-top duration-700">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl shadow-lg mb-4 overflow-hidden bg-white">
            <img src={lushLogo} alt="Lush Laundry" className="w-16 h-16 object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Lush Laundry ERP
          </h1>
          <p className="text-muted-foreground flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4" />
            Elegance Begins With Clean
            <Sparkles className="h-4 w-4" />
          </p>
        </div>

        {/* Create Account Card */}
        <Card className="shadow-2xl border-2 animate-in fade-in slide-in-from-bottom duration-700 delay-300">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-bold text-center">Create Account</CardTitle>
            <CardDescription className="text-center">
              Request access to the Lush Laundry system. An administrator will review and approve your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="animate-in slide-in-from-top">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={formData.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    className="pl-10 h-11"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="yourname@gmail.com"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className={`pl-10 h-11 ${emailError ? 'border-red-500' : ''}`}
                    required
                    disabled={loading}
                  />
                </div>
                {emailError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <span>⚠️</span>
                    {emailError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Use a valid email (Gmail, Outlook, or company email). You'll receive approval notifications here.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+256 *** *** ***"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="pl-10 h-11"
                    required
                    disabled={loading}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Use Uganda format: +256XXXXXXXXX
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Requested Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => handleChange('role', value)}
                  disabled={loading}
                >
                  <SelectTrigger id="role" className="h-11">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Administrator</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="DESKTOP_AGENT">Desktop Agent</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Your requested role will be reviewed and approved by the Systems Administrator.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    className="pl-10 pr-10 h-11"
                    required
                    disabled={loading}
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={loading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                
                {/* Password Strength Indicator */}
                {formData.password && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Password Strength:</span>
                      <span className={getPasswordStrengthColor(validatePassword(formData.password).strength)}>
                        {getPasswordStrengthLabel(validatePassword(formData.password).strength)}
                      </span>
                    </div>
                    
                    {/* Password Requirements */}
                    {passwordErrors.length > 0 && (
                      <ul className="text-xs text-red-500 space-y-1">
                        {passwordErrors.map((err, idx) => (
                          <li key={idx}>• {err}</li>
                        ))}
                      </ul>
                    )}
                    
                    {passwordErrors.length === 0 && formData.password && (
                      <p className="text-xs text-green-600">✓ Password meets all requirements</p>
                    )}
                  </div>
                )}
                
                {!formData.password && (
                  <p className="text-xs text-muted-foreground">
                    Must contain: uppercase, lowercase, number, and special character (@$!%*?&)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    className="pl-10 pr-10 h-11"
                    required
                    disabled={loading}
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={loading}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
                  📋 Your account will be reviewed by an administrator before approval.
                  You'll receive your login credentials once approved.
                </AlertDescription>
              </Alert>

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>

              <div className="text-center">
                <Link 
                  to="/login" 
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Login
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-6 animate-in fade-in delay-700">
          © 2026 Lush Laundry - Mbarara, Uganda
        </p>
      </div>
    </div>
  );
}
