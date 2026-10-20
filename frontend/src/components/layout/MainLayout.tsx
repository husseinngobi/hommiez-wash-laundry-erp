import { ReactNode, useState, useEffect } from 'react';
import { API_BASE_URL, API_ORIGIN } from '@/lib/api';
import { Sidebar } from './Sidebar';
import { Search, Menu, X, Clock, LogOut } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { resolveProfilePictureUrl } from '@/lib/profilePicture';
import axios from 'axios';

interface MainLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

interface BusinessHoursDay {
  open: string;
  close: string;
  closed: boolean;
}

interface BusinessHours {
  monday: BusinessHoursDay;
  tuesday: BusinessHoursDay;
  wednesday: BusinessHoursDay;
  thursday: BusinessHoursDay;
  friday: BusinessHoursDay;
  saturday: BusinessHoursDay;
  sunday: BusinessHoursDay;
}

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile); // Open immediately on desktop
  const [hasInteracted, setHasInteracted] = useState(false); // Track user interaction
  const [searchQuery, setSearchQuery] = useState('');
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, logout } = useAuth();

  // Update sidebar state when screen size changes (but mark as interacted to enable transitions)
  useEffect(() => {
    setSidebarOpen(!isMobile);
    setHasInteracted(true);
  }, [isMobile]);

  // Auto-close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  useEffect(() => {
    const fetchBusinessHours = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/settings/business-hours`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setBusinessHours(response.data);
      } catch (error) {
        console.error('Failed to fetch business hours:', error);
      }
    };
    fetchBusinessHours();
  }, [token]);

  const getCurrentDayHours = () => {
    if (!businessHours) return null;
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()] as keyof BusinessHours;
    const hours = businessHours[today];
    
    if (hours.closed) return 'Closed Today';
    
    const formatTime = (time: string) => {
      const [h, m] = time.split(':');
      const hour = parseInt(h);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${displayHour}:${m} ${ampm}`;
    };
    
    return `${formatTime(hours.open)} - ${formatTime(hours.close)}`;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Check if search query looks like an order number (starts with ORD)
    if (searchQuery.trim().toUpperCase().startsWith('ORD')) {
      navigate('/orders', { state: { searchQuery: searchQuery.trim() } });
    } else {
      // Assume it's a customer search
      navigate('/customers', { state: { searchQuery: searchQuery.trim() } });
    }
    
    setSearchQuery('');
  };

  const toggleSidebar = () => {
    setHasInteracted(true);
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        hasInteracted={hasInteracted}
        onClose={isMobile ? () => setSidebarOpen(false) : undefined}
      />
      
      {/* Mobile backdrop overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={() => {
            setHasInteracted(true);
            setSidebarOpen(false);
          }}
        />
      )}
      
      {/* Main Content */}
      <div className={`${hasInteracted ? 'transition-all duration-300' : ''} ${sidebarOpen && !isMobile ? 'pl-64' : 'pl-0'}`}>
        {/* Header */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-card border-b border-border flex items-center justify-between px-3 md:px-6 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 overflow-hidden">
            {/* Sidebar Toggle Button */}
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {sidebarOpen ? (
                <X className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Menu className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
            {title && (
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">{title}</h1>
                {subtitle && (
                  <p className="hidden sm:block text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>
                )}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md mx-2 md:mx-8 hidden sm:block">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search orders, customers..."
                className="pl-10 h-9 bg-muted/50 border-transparent focus:border-primary focus:bg-card"
              />
            </form>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {/* Business Hours */}
            {businessHours && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground font-medium">
                  {getCurrentDayHours()}
                </span>
              </div>
            )}
            <ThemeToggle />
            <NotificationDropdown />
            <Link
              to="/profile"
              className="h-8 w-8 rounded-full overflow-hidden ring-1 ring-border hover:ring-primary transition-colors"
              title="Profile"
              aria-label="Profile"
            >
              {(user?.profile_picture || user?.profile_picture_url) ? (
                <img
                  src={resolveProfilePictureUrl(user, API_ORIGIN)}
                  alt={user?.full_name || 'User profile'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground">
                  {user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                </div>
              )}
            </Link>
            <button
              onClick={() => logout()}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-3 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
