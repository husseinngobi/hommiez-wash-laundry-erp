import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireManager?: boolean; // Admin or Manager
  requireSystemAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requireAdmin = false,
  requireManager = false,
  requireSystemAdmin = false
}) => {
  const { isAuthenticated, isAdmin, isManager, isSystemAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Strict admin-only check
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/orders" replace />;
  }

  // Strict systems-admin-only check
  if (requireSystemAdmin && !isSystemAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Manager or Admin check
  if (requireManager && !isAdmin && !isManager) {
    return <Navigate to="/orders" replace />;
  }

  return <>{children}</>;
};
