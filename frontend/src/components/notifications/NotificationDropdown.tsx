import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { Bell, Check, X, Trash2, Clock, CheckCircle, AlertCircle, DollarSign, Receipt, Megaphone, ShoppingCart, RotateCcw, Database, ExternalLink, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export function NotificationDropdown() {
  const { token, user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [announcementDialog, setAnnouncementDialog] = useState<Notification | null>(null);
  const [detailNotification, setDetailNotification] = useState<Notification | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/notifications?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Handle both response formats: array directly or wrapped in object
      const notificationsData = Array.isArray(response.data) 
        ? response.data 
        : (response.data.notifications || []);
      
      setNotifications(notificationsData);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      if (axios.isAxiosError(error)) {
        console.error('Error response:', error.response?.data);
      }
    }
  }, [token]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUnreadCount(response.data.count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const markAsRead = async (id: number) => {
    try {
      await axios.patch(
        `${API_BASE_URL}/notifications/${id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.patch(
        `${API_BASE_URL}/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      toast.error('Failed to mark notifications as read');
    }
  };

  const deleteNotification = async (id: number, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await axios.delete(`${API_BASE_URL}/notifications/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success('Notification deleted');
    } catch (error) {
      console.error('Failed to delete notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  /** Extract order number from notification data or link */
  const extractOrderNumber = (notification: Notification): string | null => {
    if (notification.data?.order_number) return notification.data.order_number as string;
    if (notification.link) {
      const m = notification.link.match(/[?&]order=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
      const m2 = notification.link.match(/[?&]highlight=([^&]+)/);
      if (m2) return decodeURIComponent(m2[1]);
    }
    return null;
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    setOpen(false);

    // Normalize type to uppercase for consistent handling
    const notificationType = notification.type?.toUpperCase();

    // Handle different notification types
    switch (notificationType) {
      case 'ANNOUNCEMENT':
        // Show dialog for announcements
        setAnnouncementDialog(notification);
        break;
      
      case 'BACKUP_SUCCESS':
      case 'BACKUP_FAILED':
      case 'BACKUP_EMAIL_SENT':
        // Navigate to Settings > Data Management
        if (notification.link) {
          navigate(notification.link);
        } else {
          navigate('/settings?tab=data-management');
        }
        break;
      
      case 'EXPENSE':
      case 'EXPENSE_CREATED':
      case 'EXPENSE_UPDATED':
        setAnnouncementDialog(notification);
        break;
      
      case 'PAYMENT':
      case 'PAYMENT_RECEIVED':
      case 'PENDING_PAYMENT':
      case 'PAYMENT_ASSIGNED':
      case 'ORDER':
      case 'ORDER_CREATED':
      case 'ORDER_UPDATED':
      case 'ORDER_STATUS':
      case 'BARGAIN_USED': {
        // Show a detail card; user can then click "View Order" to navigate with highlight
        setDetailNotification(notification);
        break;
      }
      
      case 'DELIVERY':
      case 'DELIVERY_COMPLETED':
        // Navigate to deliveries page
        navigate('/deliveries');
        break;
      
      case 'REFUND_REQUEST':
      case 'REFUND_REJECTED':
        if (notification.link) {
          navigate(notification.link);
        } else {
          navigate('/refund-requests');
        }
        break;
      
      case 'REFUND_PROCESSED':
      case 'REFUND_APPROVED':
        if (notification.link) {
          navigate(notification.link);
        } else {
          navigate('/orders');
        }
        break;
      
      default:
        // Check if this notification has an order number → show detail dialog
        if (extractOrderNumber(notification)) {
          setDetailNotification(notification);
        } else if (notification.link) {
          navigate(notification.link);
        } else if (notification.data?.link) {
          navigate(notification.data.link as string);
        }
        break;
    }
  };

  const getNotificationIcon = (type: string) => {
    const normalizedType = type?.toUpperCase();
    switch (normalizedType) {
      case 'ANNOUNCEMENT':
        return <Megaphone className="h-4 w-4 text-purple-600" />;
      case 'BACKUP_SUCCESS':
      case 'BACKUP_EMAIL_SENT':
        return <Database className="h-4 w-4 text-green-600" />;
      case 'BACKUP_FAILED':
        return <Database className="h-4 w-4 text-red-600" />;
      case 'EXPENSE':
      case 'EXPENSE_CREATED':
      case 'EXPENSE_UPDATED':
        return <Receipt className="h-4 w-4 text-orange-600" />;
      case 'PAYMENT':
      case 'PAYMENT_RECEIVED':
      case 'PENDING_PAYMENT':
        return <DollarSign className="h-4 w-4 text-green-600" />;
      case 'PAYMENT_ASSIGNED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'ORDER':
      case 'ORDER_CREATED':
      case 'ORDER_UPDATED':
        return <ShoppingCart className="h-4 w-4 text-blue-600" />;
      case 'DELIVERY':
      case 'DELIVERY_COMPLETED':
        return <Clock className="h-4 w-4 text-cyan-600" />;
      case 'REFUND_REQUEST':
        return <RotateCcw className="h-4 w-4 text-yellow-600" />;
      case 'REFUND_PROCESSED':
      case 'REFUND_APPROVED':
        return <RotateCcw className="h-4 w-4 text-green-600" />;
      case 'REFUND_REJECTED':
        return <RotateCcw className="h-4 w-4 text-red-600" />;
      case 'SYSTEM_ALERT':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Bell className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      {/* Announcement Dialog */}
      <Dialog open={!!announcementDialog} onOpenChange={() => setAnnouncementDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {announcementDialog?.type?.toUpperCase() === 'ANNOUNCEMENT' ? (
                <Megaphone className="h-5 w-5 text-purple-600" />
              ) : announcementDialog?.type?.toUpperCase() === 'EXPENSE' ? (
                <Receipt className="h-5 w-5 text-orange-600" />
              ) : (
                <Bell className="h-5 w-5 text-blue-600" />
              )}
              <DialogTitle>{announcementDialog?.title}</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-muted-foreground pt-2">
              {new Date(announcementDialog?.created_at || '').toLocaleString('en-UG', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm whitespace-pre-wrap">{announcementDialog?.message}</p>
          </div>
          <div className="flex justify-end gap-2">
            {announcementDialog?.type?.toUpperCase() === 'EXPENSE' && (
              <Button
                variant="default"
                onClick={() => {
                  setAnnouncementDialog(null);
                  navigate('/expenses');
                }}
              >
                View Expenses
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setAnnouncementDialog(null)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order / Payment / Bargain Detail Dialog */}
      <Dialog open={!!detailNotification} onOpenChange={() => setDetailNotification(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {detailNotification?.type?.toUpperCase() === 'BARGAIN_USED' ? (
                <Tag className="h-5 w-5 text-amber-500" />
              ) : detailNotification?.type?.toUpperCase().startsWith('PAYMENT') ? (
                <DollarSign className="h-5 w-5 text-green-600" />
              ) : (
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              )}
              <DialogTitle className="text-base">{detailNotification?.title}</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              {detailNotification?.created_at && new Date(detailNotification.created_at).toLocaleString('en-UG', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {detailNotification?.message}
            </p>

            {/* Key data chips */}
            {detailNotification && (() => {
              const orderNum = extractOrderNumber(detailNotification);
              const amount = detailNotification.data?.amount as number | undefined;
              const chips: { label: string; value: string; color: string }[] = [];
              if (orderNum) chips.push({ label: 'Order', value: orderNum, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' });
              if (amount) chips.push({ label: 'Amount', value: `UGX ${Number(amount).toLocaleString()}`, color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' });
              if (!chips.length) return null;
              return (
                <div className="flex flex-wrap gap-2 pt-1">
                  {chips.map(c => (
                    <span key={c.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${c.color}`}>
                      <span className="opacity-60">{c.label}:</span> {c.value}
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            {detailNotification && extractOrderNumber(detailNotification) && (
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const orderNum = extractOrderNumber(detailNotification!);
                  setDetailNotification(null);
                  navigate('/orders', { state: { highlightOrderNumber: orderNum } });
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Order
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDetailNotification(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={`h-5 w-5 transition-colors ${unreadCount > 0 ? 'text-red-500' : ''}`} />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-96">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">Notifications</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs"
              >
                Mark all read
              </Button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-muted transition-colors"
              aria-label="Close notifications"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        <ScrollArea className="h-[400px]">
          {!notifications || notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No notifications yet</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`p-4 cursor-pointer ${
                  !notification.is_read ? 'bg-muted/50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex gap-3 w-full">
                  <div className="text-2xl flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm">{notification.title}</p>
                      {!notification.is_read && (
                        <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
                      )}
                    </div>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatTimeAgo(notification.created_at)}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}
