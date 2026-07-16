import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import axios from 'axios';
import { Bell, Check, CheckCheck, ExternalLink, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// REBUILT: 2026-01-31 13:25 - Simplified notification dialog with direct API calls

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string | null;
  sender_name: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNotificationUpdate?: () => void;
}

export default function NotificationDialog({
  open,
  onOpenChange,
  onNotificationUpdate,
}: NotificationDialogProps) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Notification | null>(null);
  const { toast } = useToast();

  // Fetch notifications when dialog opens
  useEffect(() => {
    if (!open || !token) return;

    const fetchNotifications = async () => {
      try {
        setLoading(true);
        
        const response = await axios.get(`${API_BASE_URL}/notifications?limit=50`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const data = Array.isArray(response.data) ? response.data : [];
        setNotifications(data);
      } catch (error: unknown) {
        console.error('❌ Failed to fetch notifications:', error);
        const axiosError = error as { response?: { status?: number } };
        if (axiosError.response?.status !== 401) {
          toast({
            title: 'Error loading notifications',
            description: 'Please try again',
            variant: 'destructive',
          });
        }
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [open, token, toast]);

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read when clicked
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Handle navigation based on notification type
    switch (notification.type) {
      case 'ANNOUNCEMENT':
        // Show announcement in modal
        setSelectedAnnouncement(notification);
        break;
      
      case 'PENDING_PAYMENT':
        // Navigate to payments page (pending tab)
        navigate('/payments');
        onOpenChange(false);
        break;
      
      case 'PAYMENT_ASSIGNED':
        // Navigate to orders page
        navigate('/orders');
        onOpenChange(false);
        break;
      
      case 'ORDER_STATUS':
        // Navigate to orders page
        navigate('/orders');
        onOpenChange(false);
        break;
      
      case 'DELIVERY':
        // Navigate to deliveries page
        navigate('/deliveries');
        onOpenChange(false);
        break;
      
      default:
        // For unknown types, just mark as read
    }
  };

  const markAsRead = async (id: number) => {
    if (!token) return;
    
    try {
      await axios.put(
        `${API_BASE_URL}/notifications/${id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setNotifications((prev) =>
        prev.map((notif) => (notif.id === id ? { ...notif, is_read: true } : notif))
      );
      
      onNotificationUpdate?.();
    } catch (error: unknown) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!token) return;
    
    try {
      await axios.put(
        `${API_BASE_URL}/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setNotifications((prev) =>
        prev.map((notif) => ({ ...notif, is_read: true }))
      );
      
      onNotificationUpdate?.();
      
      toast({
        title: 'Success',
        description: 'All notifications marked as read',
      });
    } catch (error: unknown) {
      console.error('Failed to mark all as read:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark all notifications as read',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <DialogTitle>Notifications</DialogTitle>
              {unreadCount > 0 && (
                <Badge variant="default" className="ml-2">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
                className="flex items-center gap-1"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </Button>
            )}
          </div>
          <DialogDescription>
            Staff announcements and system notifications
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-2">
              <Bell className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground font-medium">No notifications yet</p>
              <p className="text-sm text-muted-foreground">
                You'll see announcements and updates here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`relative p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md ${
                    notification.is_read
                      ? 'bg-card border-border hover:bg-accent'
                      : 'bg-primary/5 border-primary/20 hover:bg-primary/10'
                  }`}
                >
                  {!notification.is_read && (
                    <div className="absolute top-4 left-2 w-2 h-2 rounded-full bg-primary" />
                  )}
                  
                  <div className="flex items-start justify-between gap-4 pl-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-sm">{notification.title}</h4>
                        <Badge variant="outline" className="text-xs">
                          {notification.type}
                        </Badge>
                        {notification.type === 'ANNOUNCEMENT' && (
                          <Eye className="h-3 w-3 text-muted-foreground ml-auto" />
                        )}
                        {notification.type !== 'ANNOUNCEMENT' && (
                          <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                        )}
                      </div>
                      
                      {notification.message && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                        {notification.sender_name && (
                          <span>From: {notification.sender_name}</span>
                        )}
                        {notification.sender_name && <span>•</span>}
                        <span>{formatDate(notification.created_at)}</span>
                        <span>•</span>
                        <span className="text-primary font-medium">
                          {notification.type === 'ANNOUNCEMENT' ? 'Click to read' : 'Click to view'}
                        </span>
                      </div>
                    </div>

                    {!notification.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification.id);
                        }}
                        className="flex-shrink-0"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>

      {/* Announcement Detail Modal */}
      <Dialog open={!!selectedAnnouncement} onOpenChange={(open) => !open && setSelectedAnnouncement(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              {selectedAnnouncement?.title}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-xs">
              {selectedAnnouncement?.sender_name && (
                <>
                  <span>From: {selectedAnnouncement.sender_name}</span>
                  <span>•</span>
                </>
              )}
              <span>{selectedAnnouncement && formatDate(selectedAnnouncement.created_at)}</span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {selectedAnnouncement?.message}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedAnnouncement(null)}
            >
              Close
            </Button>
            {selectedAnnouncement && !selectedAnnouncement.is_read && (
              <Button
                onClick={() => {
                  markAsRead(selectedAnnouncement.id);
                  setSelectedAnnouncement(null);
                }}
              >
                Mark as Read & Close
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
