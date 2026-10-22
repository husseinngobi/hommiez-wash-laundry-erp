import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Lock, Shield } from 'lucide-react';

interface SessionExpiredModalProps {
  isOpen: boolean;
  onLogin: () => void;
}

export default function SessionExpiredModal({
  isOpen,
  onLogin,
}: SessionExpiredModalProps) {
  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30">
              <Lock className="h-6 w-6 text-red-600 dark:text-red-500" />
            </div>
            <AlertDialogTitle className="text-xl">
              Session Expired
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base space-y-3">
            <p className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Your session has expired for security reasons.
            </p>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground leading-relaxed">
                To protect your account and data, we automatically log you out after
                a period of inactivity. This helps prevent unauthorized access if
                you leave your device unattended.
              </p>
            </div>
            <p className="text-sm font-medium">
              Please log in again to continue using Hommiez Wash Laundry and Dry Cleaners.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={onLogin}
            className="w-full bg-primary hover:bg-primary/90"
          >
            Go to Login
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
