import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { API_ORIGIN } from '@/lib/api';
import { resolveProfilePictureUrl } from '@/lib/profilePicture';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  DollarSign,
  BarChart3,
  Settings,
  HelpCircle,
  LogOut,
  ClipboardList,
  Truck,
  Shield,
  Receipt,
  TrendingUp,
  MessageSquare,
  Wallet,
  FileText,
  ClipboardCheck,
  KeyRound,
  X,
} from 'lucide-react';
import lushLogo from '@/assets/lush_logo.jpeg';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'New Order', href: '/orders/new', icon: ShoppingCart },
  { name: 'Orders', href: '/orders', icon: ClipboardList },
  { name: 'Payments', href: '/payments', icon: Wallet },
  { name: 'Expenses', href: '/expenses', icon: Receipt },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Price List', href: '/prices', icon: DollarSign },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Deliveries', href: '/deliveries', icon: Truck },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
];

const secondaryNavigation = [
  { name: 'User Management', href: '/user-management', icon: Shield, adminOnly: true }, // Admin only
  { name: 'Password Resets', href: '/password-reset-requests', icon: KeyRound, adminOnly: true }, // Admin only
  { name: 'Refund Requests', href: '/refund-requests', icon: ClipboardCheck, adminOnly: true }, // Admin only
  { name: 'Financial Dashboard', href: '/financial', icon: TrendingUp, adminOnly: true },
  { name: 'Accounting', href: '/accounting', icon: FileText, adminOnly: true },
  { name: 'Payroll', href: '/payroll', icon: Users, adminOnly: true },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Help', href: '/help', icon: HelpCircle },
];

interface SidebarProps {
  isOpen: boolean;
  hasInteracted?: boolean; // Track if user has manually toggled sidebar
  onClose?: () => void;
}

export function Sidebar({ isOpen, hasInteracted = false, onClose }: SidebarProps) {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { user, isAdmin, isCashier, isManager, canAccessSettings } = useAuth();

  // Filter main navigation based on role
  const visibleNavigation = navigation.filter(item => {
    if (isAdmin) return true; // Admin sees everything
    
    // MANAGER: Access to most features (including reports - operational only)
    if (isManager) {
      // Manager CAN see these pages
      if (item.href === '/') return true; // Dashboard
      if (item.href === '/orders/new') return true; // New Order
      if (item.href === '/orders') return true; // Orders
      if (item.href === '/payments') return true; // Payments
      if (item.href === '/expenses') return true; // Expenses
      if (item.href === '/customers') return true; // Customers
      if (item.href === '/prices') return true; // Price List
      if (item.href === '/inventory') return true; // Inventory
      if (item.href === '/deliveries') return true; // Deliveries
      if (item.href === '/messages') return true; // Messages
      if (item.href === '/reports') return true; // Reports (operational, no accounting)
      
      return false;
    }
    
    // DESKTOP_AGENT: Limited access (NO inventory, but CAN see personal performance in reports)
    if (isCashier) {
      // Explicitly BLOCKED from Desktop Agents
      if (item.href === '/inventory') return false;
      
      // Desktop Agent CAN see these pages
      if (item.href === '/') return true; // Dashboard
      if (item.href === '/orders/new') return true; // New Order
      if (item.href === '/orders') return true; // Orders
      if (item.href === '/payments') return true; // Payments
      if (item.href === '/expenses') return true; // Expenses
      if (item.href === '/customers') return true; // Customers
      if (item.href === '/reports') return true; // Reports (personal performance only)
      if (item.href === '/prices') return true; // Price List
      if (item.href === '/deliveries') return true; // Deliveries
      if (item.href === '/messages') return true; // Messages
    }
    
    return false; // Default: hide from non-authenticated or unknown roles
  });

  // Filter secondary navigation based on permissions
  const visibleSecondaryNavigation = secondaryNavigation.filter(item => {
    // Admin-only pages (User Management, Financial, Accounting, Payroll)
    if (item.adminOnly && !isAdmin) return false;
    
    // Settings: Check permission
    if (item.href === '/settings' && !canAccessSettings) return false;
    
    return true;
  });

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col",
      hasInteracted && "transition-transform duration-300",
      !isOpen && "-translate-x-full"
    )}>
      {/* Logo */}
      <div className="flex h-16 sm:h-20 items-center justify-between border-b border-sidebar-border px-4 flex-shrink-0">
        <img
          src={lushLogo}
          alt="Lush Dry Cleaners"
          className="h-12 sm:h-14 w-auto object-contain"
        />
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
            aria-label="Close menu"
            title="Close menu"
          >
            <X className="h-5 w-5 text-sidebar-foreground/80" />
          </button>
        )}
      </div>

      {/* Main Navigation - Scrollable */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin scrollbar-thumb-sidebar-border scrollbar-track-transparent">
        <ul className="space-y-1">
          {visibleNavigation.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  className={cn('nav-item', isActive && 'active')}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="font-medium truncate">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Secondary Navigation */}
        <div className="mt-6 pt-6 border-t border-sidebar-border">
          <ul className="space-y-1">
            {visibleSecondaryNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={cn('nav-item', isActive && 'active')}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* User Section - Always Visible at Bottom */}
      <div className="border-t border-sidebar-border p-3 sm:p-4 flex-shrink-0 bg-sidebar">
        <Link 
          to="/profile"
          className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg hover:bg-sidebar-accent transition-colors group"
        >
          {(user?.profile_picture || user?.profile_picture_url) ? (
            <>
              <img
                src={resolveProfilePictureUrl(user, API_ORIGIN)}
                alt={user.full_name}
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full object-cover flex-shrink-0"
                onError={(e) => {
                  const imgElement = e.currentTarget;
                  const fallbackElement = imgElement.nextElementSibling as HTMLElement;
                  imgElement.classList.add('hidden');
                  if (fallbackElement) {
                    fallbackElement.classList.remove('hidden');
                    fallbackElement.classList.add('flex');
                  }
                }}
              />
              <div className="hidden h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-sidebar-primary items-center justify-center flex-shrink-0">
                <span className="text-sidebar-primary-foreground font-semibold text-xs sm:text-sm">
                  {user?.full_name.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                </span>
              </div>
            </>
          ) : (
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-sidebar-primary flex items-center justify-center flex-shrink-0">
              <span className="text-sidebar-primary-foreground font-semibold text-xs sm:text-sm">
                {user?.full_name.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-medium text-sidebar-foreground truncate">
              {user?.full_name || 'User'}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {user?.email || ''}
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
