import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Mail, Lock, Sparkles, UserPlus, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  // Check for OAuth error messages in URL
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      switch (errorParam) {
        case 'account_pending':
          setError('⏳ Your account is pending approval. Please contact an administrator to activate your account.');
          break;
        case 'account_suspended':
          setError('🚫 Your account has been suspended. Please contact an administrator.');
          break;
        case 'account_inactive':
          setError('❌ Your account is not active. Please contact support.');
          break;
        default:
          setError('❌ An error occurred during sign in. Please try again.');
      }
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      await login(email, password);
    } catch (err: unknown) {
      // Provide specific error messages
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Incorrect login credentials') || message.includes('Invalid credentials') || message.includes('401')) {
        setError('❌ Incorrect login credentials. Please try again.');
      } else if (message.includes('rejected')) {
        setError(`❌ ${message}`);
      } else if (message.includes('pending')) {
        setError('⏳ Your account is pending approval. Please contact an administrator.');
      } else if (message.includes('suspended')) {
        setError('🚫 Your account has been suspended. Please contact an administrator.');
      } else {
        setError(message || '⚠️ Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="h-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-2 sm:p-4 overscroll-none"
      style={{ touchAction: 'manipulation' }}
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div 
        className="w-full max-w-md relative z-10 max-h-full select-none"
        style={{ touchAction: 'manipulation' }}
      >
        {/* Logo and Brand */}
        <div className="text-center mb-3 sm:mb-6 animate-in fade-in slide-in-from-top duration-700">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl shadow-lg mb-2 sm:mb-3 overflow-hidden bg-white">
            <img src="/favicon.png" alt="Lush Laundry" className="w-10 h-10 sm:w-14 sm:h-14 object-contain" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
            Lush Laundry ERP
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground flex items-center justify-center gap-1.5">
            <Sparkles className="h-3 w-3 flex-shrink-0" />
            <span className="truncate px-2">Elegance Begins With Clean</span>
            <Sparkles className="h-3 w-3 flex-shrink-0" />
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-2xl border-2 animate-in fade-in slide-in-from-bottom duration-700 delay-300">
          <CardHeader className="space-y-1 pb-3 sm:pb-4">
            <CardTitle className="text-lg sm:text-xl font-bold text-center">Welcome Back</CardTitle>
            <CardDescription className="text-center text-xs sm:text-sm">
              Sign in to manage your laundry operations
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-4 sm:pb-6">
            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <Alert variant="destructive" className="animate-in slide-in-from-top py-2">
                  <AlertDescription className="text-xs sm:text-sm break-words">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs sm:text-sm">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 sm:left-3 top-2.5 sm:top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-8 sm:pl-10 h-9 sm:h-10 text-xs sm:text-sm"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs sm:text-sm">Password</Label>
                  <Link 
                    to="/forgot-password" 
                    className="text-[10px] sm:text-xs text-primary hover:underline"
                  >
                    Forgot?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-2.5 sm:left-3 top-2.5 sm:top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-8 sm:pl-10 pr-9 h-9 sm:h-10 text-xs sm:text-sm"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 sm:right-3 top-2.5 sm:top-3 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={loading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-9 sm:h-10 text-xs sm:text-sm font-semibold mt-4"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            {/* Create Account Link */}
            <div className="mt-3 sm:mt-4 text-center space-y-1.5 sm:space-y-2">
              <Separator />
              <p className="text-[10px] sm:text-xs text-muted-foreground pt-1">
                Don't have an account?
              </p>
              <Link to="/create-account">
                <Button 
                  variant="outline" 
                  className="w-full h-9 sm:h-10 text-xs sm:text-sm"
                  disabled={loading}
                >
                  <UserPlus className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="truncate">Create Account</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-[10px] sm:text-xs text-muted-foreground mt-2 sm:mt-4 animate-in fade-in delay-700">
          © 2026 Lush Laundry
        </p>
      </div>
    </div>
  );
}
