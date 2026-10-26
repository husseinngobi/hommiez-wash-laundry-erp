import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL, API_ORIGIN } from '@/lib/api';
import { resolveProfilePictureUrl } from '@/lib/profilePicture';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Users, UserCheck, UserX, UserPlus, Shield, Activity,
  Search, CheckCircle2, XCircle, AlertCircle, Ban,
  RotateCcw, Trash2, Eye, Clock, Calendar, History, Pencil, Loader2
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import axios, { AxiosError } from 'axios';

interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  role: 'ADMIN' | 'MANAGER' | 'DESKTOP_AGENT';
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  created_at: string;
  updated_at: string;
  last_login?: string;
  approved_by?: number;
  approved_at?: string;
  rejection_reason?: string;
  created_by_name?: string;
  approved_by_name?: string;
  must_change_password?: boolean;
  profile_picture?: string;
  profile_picture_url?: string;
  branch_id?: number | null;
  branch_name?: string | null;
}

interface BranchOption {
  id: number;
  name: string;
  is_active: boolean;
}

interface LoginHistory {
  id: number;
  user_id: number;
  action: string;
  ip_address: string;
  user_agent?: string;
  created_at: string;
  details?: Record<string, unknown>;
}

interface ActivityLog {
  id: number;
  user_id: number;
  user_email: string;
  user_name: string;
  user_role: string;
  action: string;
  resource_type: string;
  resource_id: number;
  details: Record<string, unknown>;
  ip_address: string;
  created_at: string;
}

interface Statistics {
  active_users: number;
  pending_users: number;
  suspended_users: number;
  rejected_users: number;
  admin_count: number;
  manager_count: number;
  desktop_agent_count: number;
  total_users: number;
}

const UserManagement = () => {
  const { token, isAdmin, isManager } = useAuth();
  const canManageUsers = isAdmin || isManager;
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all-users');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const usersPerPage = 10;

  // Dialogs
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', email: '' });
  const [savingDetails, setSavingDetails] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [suspendingUser, setSuspendingUser] = useState(false);
  const suspendingUserRef = useRef(false);
  const [userActionPending, setUserActionPending] = useState<string | null>(null);
  const userActionPendingRef = useRef(false);
  const [updatingBranchUserId, setUpdatingBranchUserId] = useState<number | null>(null);
  const updatingBranchRef = useRef<number | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTempPasswordDialog, setShowTempPasswordDialog] = useState(false);
  const [showLoginHistoryDialog, setShowLoginHistoryDialog] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);

  // Login History
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState('week');

  // Form states
  const [rejectionReason, setRejectionReason] = useState('');
  const [suspensionReason, setSuspensionReason] = useState('');
  const [newRole, setNewRole] = useState<string>('');
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  // Branch assignment only appears once the business runs more than one branch
  const multiBranch = branchOptions.length > 1;
  const [temporaryPassword, setTemporaryPassword] = useState<string>('');

  // Fetch data
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (roleFilter !== 'all') params.role = roleFilter;
      if (searchQuery) params.search = searchQuery;
      params.page = currentPage.toString();
      params.limit = usersPerPage.toString();

      const response = await axios.get(`${API_BASE_URL}/admin/users`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });

      setUsers(response.data.users);
      setTotalUsers(response.data.total || response.data.users.length);
      setTotalPages(Math.ceil((response.data.total || response.data.users.length) / usersPerPage));
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, roleFilter, searchQuery, currentPage, token, toast]);

  const fetchStatistics = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/users/statistics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatistics(response.data.statistics);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  }, [token]);

  const fetchBranchOptions = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/branches`, {
        params: { active: 'true' },
        headers: { Authorization: `Bearer ${token}` },
      });
      setBranchOptions(response.data.branches || []);
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  }, [token]);

  const fetchActivityLogs = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/activity-logs`, {
        params: { limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setActivityLogs(response.data.logs);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    }
  }, [token]);

  const fetchLoginHistory = useCallback(async (userId: number) => {
    try {
      setLoginHistoryLoading(true);

      // Calculate date range based on period
      const endDate = new Date();
      const startDate = new Date();

      if (historyPeriod === 'week') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (historyPeriod === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
      } else if (historyPeriod === '3months') {
        startDate.setMonth(startDate.getMonth() - 3);
      }

      const response = await axios.get(`${API_BASE_URL}/admin/users/${userId}/login-history`, {
        params: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      setLoginHistory(response.data.history || []);
    } catch (error) {
      console.error('Error fetching login history:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch login history',
        variant: 'destructive',
      });
    } finally {
      setLoginHistoryLoading(false);
    }
  }, [historyPeriod, token, toast]);

  useEffect(() => {
    if (canManageUsers) {
      fetchUsers();
      fetchStatistics();
      fetchActivityLogs();
      fetchBranchOptions();
    }
  }, [canManageUsers, fetchUsers, fetchStatistics, fetchActivityLogs, fetchBranchOptions]);

  // Actions
  const handleApproveUser = async () => {
    if (!selectedUser || userActionPendingRef.current) return;
    userActionPendingRef.current = true;
    setUserActionPending('approve');

    try {
      await axios.put(
        `${API_BASE_URL}/admin/users/${selectedUser.id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Success',
        description: 'User approved successfully with their registration role',
      });
      setUsers((current) => current.map((user) => user.id === selectedUser.id ? { ...user, status: 'ACTIVE' } : user));

      setShowApproveDialog(false);
      setSelectedUser(null);
      fetchUsers();
      fetchStatistics();
      fetchActivityLogs();
    } catch (error) {
      console.error('Error approving user:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve user',
        variant: 'destructive',
      });
    } finally {
      userActionPendingRef.current = false;
      setUserActionPending(null);
    }
  };

  const handleRejectUser = async () => {
    if (!selectedUser || userActionPendingRef.current) return;
    userActionPendingRef.current = true;
    setUserActionPending('reject');

    try {
      await axios.put(
        `${API_BASE_URL}/admin/users/${selectedUser.id}/reject`,
        { reason: rejectionReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Success',
        description: 'User rejected',
      });
      setUsers((current) => current.map((user) => user.id === selectedUser.id ? { ...user, status: 'REJECTED' } : user));

      setShowRejectDialog(false);
      setSelectedUser(null);
      setRejectionReason('');
      fetchUsers();
      fetchStatistics();
      fetchActivityLogs();
    } catch (error) {
      console.error('Error rejecting user:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to reject user';
      toast({
        title: 'Error',
        description: errorMessage || 'Failed to reject user',
        variant: 'destructive',
      });
    } finally {
      userActionPendingRef.current = false;
      setUserActionPending(null);
    }
  };

  const handleSuspendUser = async () => {
    if (!selectedUser || suspendingUserRef.current) return;
    suspendingUserRef.current = true;
    setSuspendingUser(true);

    try {
      await axios.put(
        `${API_BASE_URL}/admin/users/${selectedUser.id}/suspend`,
        { reason: suspensionReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Success',
        description: 'User suspended',
      });
      setUsers((current) => current.map((user) => user.id === selectedUser.id ? { ...user, status: 'SUSPENDED' } : user));

      setShowSuspendDialog(false);
      setSelectedUser(null);
      setSuspensionReason('');
      fetchUsers();
      fetchStatistics();
      fetchActivityLogs();
    } catch (error) {
      console.error('Error suspending user:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to suspend user';
      toast({
        title: 'Error',
        description: errorMessage || 'Failed to suspend user',
        variant: 'destructive',
      });
    } finally {
      suspendingUserRef.current = false;
      setSuspendingUser(false);
    }
  };

  const handleActivateUser = async (user: User) => {
    if (userActionPendingRef.current) return;
    userActionPendingRef.current = true;
    setUserActionPending(`activate-${user.id}`);
    try {
      const response = await axios.put(
        `${API_BASE_URL}/admin/users/${user.id}/activate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const activatedUser: User = { ...user, status: 'ACTIVE' };

      // Show temporary password to admin
      if (response.data.temporaryPassword) {
        setSelectedUser(activatedUser);
        setTemporaryPassword(response.data.temporaryPassword);
        setShowTempPasswordDialog(true);
      }

      toast({
        title: 'Success',
        description: 'User reactivated with temporary password',
      });
      await Promise.all([fetchUsers(), fetchStatistics(), fetchActivityLogs()]);

      if (statusFilter === 'SUSPENDED') {
        setUsers((current) => current.filter((entry) => entry.id !== user.id));
        const nextTotal = Math.max(0, totalUsers - 1);
        setTotalUsers(nextTotal);
        setTotalPages(Math.max(1, Math.ceil(nextTotal / usersPerPage)));
        setCurrentPage((page) => Math.min(page, Math.max(1, Math.ceil(nextTotal / usersPerPage))));
      } else {
        setUsers((current) => current.map((entry) => entry.id === user.id ? activatedUser : entry));
      }
      setSelectedUser((current) => current?.id === user.id ? activatedUser : current);
    } catch (error) {
      console.error('Error activating user:', error);
      toast({
        title: 'Error',
        description: 'Failed to activate user',
        variant: 'destructive',
      });
    } finally {
      userActionPendingRef.current = false;
      setUserActionPending(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: 'Temporary password copied to clipboard',
    });
  };

  const handleUpdateBranch = async (user: User, value: string) => {
    const branchId = value === 'none' ? null : Number(value);
    if ((user.branch_id ?? null) === branchId || updatingBranchRef.current !== null) return;
    updatingBranchRef.current = user.id;
    setUpdatingBranchUserId(user.id);

    try {
      await axios.put(
        `${API_BASE_URL}/admin/users/${user.id}/branch`,
        { branch_id: branchId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Branch updated',
        description: branchId
          ? `${user.full_name} now books orders under ${branchOptions.find((b) => b.id === branchId)?.name}.`
          : `${user.full_name} is no longer assigned to a branch.`,
      });
      const branchName = branchId ? branchOptions.find((b) => b.id === branchId)?.name ?? null : null;
      setUsers((current) => current.map((entry) => entry.id === user.id
        ? { ...entry, branch_id: branchId, branch_name: branchName }
        : entry));
      setSelectedUser((current) => current?.id === user.id
        ? { ...current, branch_id: branchId, branch_name: branchName }
        : current);
      fetchUsers();
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string }>;
      toast({
        title: 'Error',
        description: axiosError.response?.data?.error || 'Failed to update branch assignment',
        variant: 'destructive',
      });
    } finally {
      updatingBranchRef.current = null;
      setUpdatingBranchUserId(null);
    }
  };

  const openEditUser = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      full_name: user.full_name || '',
      phone: user.phone || '',
      email: user.email || '',
    });
    setShowEditDialog(true);
  };

  const handleSaveUserDetails = async () => {
    if (!selectedUser || !token) return;
    try {
      setSavingDetails(true);
      const response = await axios.put(
        `${API_BASE_URL}/admin/users/${selectedUser.id}/details`,
        {
          full_name: editForm.full_name.trim(),
          phone: editForm.phone.trim(),
          email: editForm.email.trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: 'User updated',
        description: response.data.message || 'Details saved. They will use this email to log in.',
      });
      setShowEditDialog(false);
      setShowDetailsDialog(false);
      fetchUsers();
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string }>;
      toast({
        title: 'Error',
        description: axiosError.response?.data?.error || 'Failed to update user details',
        variant: 'destructive',
      });
    } finally {
      setSavingDetails(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser || !newRole || userActionPendingRef.current) return;
    userActionPendingRef.current = true;
    setUserActionPending('role');

    try {
      await axios.put(
        `${API_BASE_URL}/admin/users/${selectedUser.id}/role`,
        { role: newRole },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Success',
        description: 'User role updated successfully',
      });
      setUsers((current) => current.map((user) => user.id === selectedUser.id ? { ...user, role: newRole as User['role'] } : user));

      setShowRoleDialog(false);
      setSelectedUser(null);
      setNewRole('');
      fetchUsers();
      fetchStatistics();
      fetchActivityLogs();
    } catch (error) {
      console.error('Error updating role:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to update role';
      toast({
        title: 'Error',
        description: errorMessage || 'Failed to update role',
        variant: 'destructive',
      });
    } finally {
      userActionPendingRef.current = false;
      setUserActionPending(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser || userActionPendingRef.current) return;
    userActionPendingRef.current = true;
    setUserActionPending('delete');

    try {
      await axios.delete(
        `${API_BASE_URL}/admin/users/${selectedUser.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });
      setUsers((current) => current.filter((user) => user.id !== selectedUser.id));

      setShowDeleteDialog(false);
      setDeleteConfirmStep(1);
      setSelectedUser(null);
      fetchUsers();
      fetchStatistics();
      fetchActivityLogs();
    } catch (error) {
      console.error('Error deleting user:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to delete user';
      toast({
        title: 'Error',
        description: errorMessage || 'Failed to delete user',
        variant: 'destructive',
      });
    } finally {
      userActionPendingRef.current = false;
      setUserActionPending(null);
    }
  };

  // Helper functions
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'CASHIER': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'SUSPENDED':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"><Ban className="h-3 w-3 mr-1" />Suspended</Badge>;
      case 'REJECTED':
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const getActionIcon = (action: string) => {
    if (action.includes('CREATE')) return '➕';
    if (action.includes('UPDATE') || action.includes('EDIT')) return '✏️';
    if (action.includes('DELETE')) return '🗑️';
    if (action.includes('APPROVE')) return '✅';
    if (action.includes('REJECT')) return '❌';
    if (action.includes('SUSPEND')) return '🚫';
    if (action.includes('LOGIN')) return '🔐';
    return '📋';
  };

  if (!canManageUsers) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-gray-600 dark:text-gray-400">
              This page is only accessible to administrators and managers.
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="h-8 w-8 text-purple-600" />
              User Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {isManager && !isAdmin
                ? 'Approve desktop agents, assign their branch, and help with password resets. Administrators are notified of these actions.'
                : 'Manage system users, approve requests, and track activities'}
            </p>
          </div>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statistics.total_users}</div>
              </CardContent>
            </Card>
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-green-600">
                  Active Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{statistics.active_users}</div>
              </CardContent>
            </Card>
            <Card className="border-yellow-200 dark:border-yellow-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-yellow-600">
                  Pending Approval
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{statistics.pending_users}</div>
              </CardContent>
            </Card>
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-red-600">
                  Suspended
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{statistics.suspended_users}</div>
              </CardContent>
            </Card>
            <Card className="border-purple-200 dark:border-purple-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-purple-600">
                  Administrators
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{statistics.admin_count}</div>
              </CardContent>
            </Card>
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-blue-600">
                  Desktop Agents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{statistics.desktop_agent_count}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="all-users" className="flex items-center gap-2 flex-shrink-0">
              <Users className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">All Users</span>
              <span className="sm:hidden">Users</span>
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-2 flex-shrink-0">
              <UserPlus className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Pending Approval</span>
              <span className="sm:hidden">Pending</span>
              {statistics && statistics.pending_users > 0 && (
                <Badge className="ml-1 bg-yellow-500">{statistics.pending_users}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2 flex-shrink-0">
              <Activity className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Activity Logs</span>
              <span className="sm:hidden">Activity</span>
            </TabsTrigger>
          </TabsList>

          {/* All Users Tab */}
          <TabsContent value="all-users" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle>All Users</CardTitle>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 w-full"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full sm:w-40">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="SUSPENDED">Suspended</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-full sm:w-40">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        <SelectItem value="ADMIN">Administrator</SelectItem>
                        <SelectItem value="CASHIER">Desktop Agent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No users found</div>
                ) : (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Role</TableHead>
                        {multiBranch && <TableHead>Branch</TableHead>}
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarImage
                                  src={resolveProfilePictureUrl(user, API_ORIGIN)}
                                  alt={user.full_name}
                                />
                                <AvatarFallback>
                                  {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{user.full_name}</div>
                                <div className="text-sm text-gray-500">{user.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="break-all">{user.phone}</TableCell>
                          <TableCell>
                            <Badge className={getRoleBadgeColor(user.role)}>
                              {user.role}
                            </Badge>
                          </TableCell>
                          {multiBranch && (
                            <TableCell>
                              <Select
                                value={user.branch_id ? String(user.branch_id) : 'none'}
                                onValueChange={(value) => handleUpdateBranch(user, value)}
                                disabled={updatingBranchUserId === user.id || (isManager && !isAdmin && user.role !== 'DESKTOP_AGENT')}
                              >
                                <SelectTrigger className="h-8 w-[150px]">
                                  <SelectValue placeholder="Unassigned" />
                                  {updatingBranchUserId === user.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Unassigned</SelectItem>
                                  {branchOptions.map((branch) => (
                                    <SelectItem key={branch.id} value={String(branch.id)}>
                                      {branch.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          )}
                          <TableCell>{getStatusBadge(user.status)}</TableCell>
                          <TableCell className="text-sm">
                            {formatDateTime(user.created_at)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {user.last_login ? formatDateTime(user.last_login) : 'Never'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setShowDetailsDialog(true);
                                }}
                                title="View details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditUser(user)}
                                  title="Edit name, phone, or login email"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(user);
                                  fetchLoginHistory(user.id);
                                  setShowLoginHistoryDialog(true);
                                }}
                                title="Login history"
                              >
                                <History className="h-4 w-4" />
                              </Button>

                              {user.status === 'PENDING' && (isAdmin || user.role === 'DESKTOP_AGENT') && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-green-600"
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setShowApproveDialog(true);
                                    }}
                                    title="Approve"
                                  >
                                    <UserCheck className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600"
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setShowRejectDialog(true);
                                    }}
                                    title="Reject"
                                  >
                                    <UserX className="h-4 w-4" />
                                  </Button>
                                </>
                              )}

                              {user.status === 'ACTIVE' && user.role !== 'ADMIN' && (isAdmin || user.role === 'DESKTOP_AGENT') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-orange-600"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowSuspendDialog(true);
                                  }}
                                  title="Suspend"
                                >
                                  <Ban className="h-4 w-4" />
                                </Button>
                              )}

                              {user.status === 'SUSPENDED' && (isAdmin || user.role === 'DESKTOP_AGENT') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-blue-600"
                                  disabled={userActionPending === `activate-${user.id}`}
                                  onClick={() => handleActivateUser(user)}
                                  title="Activate"
                                >
                                  {userActionPending === `activate-${user.id}`
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <RotateCcw className="h-4 w-4" />}
                                </Button>
                              )}

                              {isAdmin && user.role !== 'ADMIN' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowDeleteDialog(true);
                                  }}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                )}
                {totalPages > 1 && (
                  <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground text-center sm:text-left">
                      <span className="hidden sm:inline">Showing {((currentPage - 1) * usersPerPage) + 1} to {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers} users</span>
                      <span className="sm:hidden">{((currentPage - 1) * usersPerPage) + 1}-{Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers}</span>
                    </div>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                        {[...Array(Math.min(5, totalPages))].map((_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <PaginationItem key={pageNum}>
                              <PaginationLink
                                onClick={() => setCurrentPage(pageNum)}
                                isActive={currentPage === pageNum}
                                className="cursor-pointer"
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Approval Tab */}
          <TabsContent value="pending" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Users Pending Approval</CardTitle>
                <CardDescription>
                  Review and approve or reject new user registrations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {users.filter(u => u.status === 'PENDING').length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No pending users
                  </div>
                ) : (
                  <div className="space-y-4">
                    {users.filter(u => u.status === 'PENDING').map((user) => (
                      <Card key={user.id} className="border-yellow-200 dark:border-yellow-800">
                        <CardContent className="pt-6">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div className="space-y-2 flex-1 min-w-0">
                              <div>
                                <h3 className="font-semibold text-lg break-words">{user.full_name}</h3>
                                <p className="text-sm text-gray-600 break-all">{user.email}</p>
                                <p className="text-sm text-gray-600 break-all">{user.phone}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">\n                                <Badge className={getRoleBadgeColor(user.role)}>
                                  {user.role}
                                </Badge>
                                <span className="text-sm text-gray-500">
                                  <span className="hidden sm:inline">Registered {formatDateTime(user.created_at)}</span>
                                  <span className="sm:hidden">{formatDateTime(user.created_at)}</span>
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:flex-shrink-0">
                              <Button
                                onClick={() => {
                                  setSelectedUser(user);
                                  setShowApproveDialog(true);
                                }}
                                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                              >
                                <UserCheck className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setShowRejectDialog(true);
                                }}
                                className="border-red-300 text-red-600 hover:bg-red-50 w-full sm:w-auto"
                              >
                                <UserX className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Logs Tab */}
          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Track all user and administrator activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activityLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No activity logs yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activityLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <span className="text-2xl flex-shrink-0">{getActionIcon(log.action)}</span>
                          <div>
                            <div className="font-medium break-words">
                              {log.user_name} <span className="text-sm text-gray-500">({log.user_role})</span>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 break-words">
                              {log.action.replace(/_/g, ' ')}
                              {log.resource_type && ` • ${log.resource_type}`}
                              {log.resource_id && ` #${log.resource_id}`}
                            </div>
                            <div className="text-xs text-gray-500 break-all">
                              <span className="hidden sm:inline">{formatDateTime(log.created_at)} • IP: {log.ip_address}</span>
                              <span className="sm:hidden">{formatDateTime(log.created_at)}<br />IP: {log.ip_address}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* View Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                User Profile Details
              </DialogTitle>
              <DialogDescription>
                Complete information about this user account
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-6 py-4">
                {/* Profile Picture and Basic Info */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 pb-4 border-b">
                  <Avatar className="h-24 w-24 flex-shrink-0">
                    <AvatarImage
                      src={resolveProfilePictureUrl(selectedUser, API_ORIGIN)}
                      alt={selectedUser.full_name}
                    />
                    <AvatarFallback className="text-2xl">
                      {selectedUser.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-center sm:text-left min-w-0">
                    <h3 className="text-2xl font-bold break-words">{selectedUser.full_name}</h3>
                    <p className="text-muted-foreground break-all">{selectedUser.email}</p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                      <Badge className={getRoleBadgeColor(selectedUser.role)}>
                        {selectedUser.role}
                      </Badge>
                      {getStatusBadge(selectedUser.status)}
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Contact Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/50 p-4 rounded-lg">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Login email</label>
                      <p className="text-base mt-1 break-all">{selectedUser.email}</p>
                      <p className="text-xs text-muted-foreground mt-1">This is the address they use to sign in.</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
                      <p className="text-base mt-1 break-all">{selectedUser.phone || '—'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Branch</label>
                      <p className="text-base mt-1">{selectedUser.branch_name || 'Unassigned'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Role</label>
                      <p className="text-base mt-1">{selectedUser.role.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>

                {/* Account Information */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Account Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/50 p-4 rounded-lg">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Account Created</label>
                      <p className="text-base mt-1">{formatDateTime(selectedUser.created_at)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Last Login</label>
                      <p className="text-base mt-1">
                        {selectedUser.last_login ? formatDateTime(selectedUser.last_login) : (
                          <span className="text-muted-foreground italic">Never logged in</span>
                        )}
                      </p>
                    </div>
                    {selectedUser.created_by_name && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Created By</label>
                        <p className="text-base mt-1">{selectedUser.created_by_name}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                      <p className="text-base mt-1">{formatDateTime(selectedUser.updated_at)}</p>
                    </div>
                  </div>
                </div>

                {/* Approval Information */}
                {(selectedUser.approved_by_name || selectedUser.rejection_reason) && (
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      {selectedUser.rejection_reason ? 'Rejection Information' : 'Approval Information'}
                    </h4>
                    <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                      {selectedUser.approved_by_name && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Approved By</label>
                              <p className="text-base mt-1">{selectedUser.approved_by_name}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Approved At</label>
                              <p className="text-base mt-1">{formatDateTime(selectedUser.approved_at!)}</p>
                            </div>
                          </div>
                        </>
                      )}
                      {selectedUser.rejection_reason && (
                        <div>
                          <label className="text-sm font-medium text-red-600 dark:text-red-400">Rejection Reason</label>
                          <p className="text-base bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 rounded mt-1">
                            {selectedUser.rejection_reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-4 border-t">
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDetailsDialog(false);
                        openEditUser(selectedUser);
                      }}
                      className="gap-2 w-full sm:w-auto"
                    >
                      <Pencil className="h-4 w-4 flex-shrink-0" />
                      Edit details
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowDetailsDialog(false);
                      fetchLoginHistory(selectedUser.id);
                      setShowLoginHistoryDialog(true);
                    }}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <History className="h-4 w-4 flex-shrink-0" />
                    View Login History
                  </Button>
                  {selectedUser.status === 'ACTIVE' && selectedUser.role !== 'ADMIN' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDetailsDialog(false);
                        setShowSuspendDialog(true);
                      }}
                      className="gap-2 text-orange-600 w-full sm:w-auto"
                    >
                      <Ban className="h-4 w-4 flex-shrink-0" />
                      Suspend Account
                    </Button>
                  )}
                  {selectedUser.status === 'SUSPENDED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDetailsDialog(false);
                        handleActivateUser(selectedUser);
                      }}
                      className="gap-2 text-blue-600 w-full sm:w-auto"
                    >
                      <RotateCcw className="h-4 w-4 flex-shrink-0" />
                      Reactivate Account
                    </Button>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button onClick={() => setShowDetailsDialog(false)} className="w-full sm:w-auto">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit user details</DialogTitle>
              <DialogDescription>
                Change name, phone, or login email. The email is what they use to sign in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-full-name">Full name</Label>
                <Input
                  id="edit-full-name"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+256..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Login email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Staff cannot change this themselves. After you save, they sign in with the new email.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={savingDetails}>
                Cancel
              </Button>
              <Button onClick={handleSaveUserDetails} disabled={savingDetails}>
                {savingDetails ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Approve Dialog */}
        <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Approve User</DialogTitle>
              <DialogDescription>
                Approve this account using the role selected during account creation.
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <p><strong>Name:</strong> {selectedUser.full_name}</p>
                  <p><strong>Email:</strong> {selectedUser.email}</p>
                  <p><strong>Selected Role:</strong> {selectedUser.role}</p>
                </div>
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setShowApproveDialog(false)} disabled={userActionPending === 'approve'} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleApproveUser} disabled={userActionPending === 'approve'} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                {userActionPending === 'approve' ? 'Approving...' : 'Approve User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Reject User</DialogTitle>
              <DialogDescription>
                Provide a reason for rejecting this user registration.
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <p><strong>Name:</strong> {selectedUser.full_name}</p>
                  <p><strong>Email:</strong> {selectedUser.email}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rejection-reason">Rejection Reason</Label>
                  <Textarea
                    id="rejection-reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter reason for rejection..."
                    rows={4}
                  />
                </div>
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" disabled={userActionPending === 'reject'} onClick={() => {
                setShowRejectDialog(false);
                setRejectionReason('');
              }} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleRejectUser} disabled={userActionPending === 'reject'} variant="destructive" className="w-full sm:w-auto">
                {userActionPending === 'reject' ? 'Rejecting...' : 'Reject User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Suspend Dialog */}
        <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Suspend User</DialogTitle>
              <DialogDescription>
                Provide a reason for suspending this user account.
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <p><strong>Name:</strong> {selectedUser.full_name}</p>
                  <p><strong>Email:</strong> {selectedUser.email}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="suspension-reason">Suspension Reason</Label>
                  <Textarea
                    id="suspension-reason"
                    value={suspensionReason}
                    onChange={(e) => setSuspensionReason(e.target.value)}
                    placeholder="Enter reason for suspension..."
                    rows={4}
                  />
                </div>
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" disabled={suspendingUser} onClick={() => {
                setShowSuspendDialog(false);
                setSuspensionReason('');
              }} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleSuspendUser} disabled={suspendingUser} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 w-full sm:w-auto">
                {suspendingUser ? 'Suspending...' : 'Suspend User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this user? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-2 py-4 bg-red-50 dark:bg-red-950 p-4 rounded">
                <p><strong>Name:</strong> {selectedUser.full_name}</p>
                <p><strong>Email:</strong> {selectedUser.email}</p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                  ⚠️ Warning: This will permanently delete the user account.
                </p>
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={userActionPending === 'delete'} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleDeleteUser} disabled={userActionPending === 'delete'} variant="destructive" className="w-full sm:w-auto">
                {userActionPending === 'delete' ? 'Deleting...' : 'Delete User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Temporary Password Dialog */}
        <Dialog open={showTempPasswordDialog} onOpenChange={setShowTempPasswordDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-500" />
                User Reactivated Successfully
              </DialogTitle>
              <DialogDescription>
                A temporary password has been generated. Please provide this to the user.
              </DialogDescription>
            </DialogHeader>

            {selectedUser && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <p className="text-sm"><strong>User:</strong> {selectedUser.full_name}</p>
                  <p className="text-sm"><strong>Email:</strong> {selectedUser.email}</p>
                </div>

                <div className="space-y-2">
                  <Label>Temporary Password</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={temporaryPassword}
                      readOnly
                      className="font-mono text-lg font-bold"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(temporaryPassword)}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click to copy and share with the user
                  </p>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <div className="flex gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm space-y-1">
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">Important:</p>
                      <ul className="list-disc list-inside text-yellow-700 dark:text-yellow-300 space-y-1">
                        <li>User must change this password on first login</li>
                        <li>This password will not be shown again</li>
                        <li>Store it securely or send it to the user now</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button onClick={() => {
                setShowTempPasswordDialog(false);
                setTemporaryPassword('');
                setSelectedUser(null);
              }} className="w-full sm:w-auto">
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Login History Dialog */}
        <Dialog open={showLoginHistoryDialog} onOpenChange={setShowLoginHistoryDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Login History - {selectedUser?.full_name}
              </DialogTitle>
              <DialogDescription>
                View login activity and access patterns for this user
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {/* Period Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Label>Period:</Label>
                <Select value={historyPeriod} onValueChange={(value) => {
                  setHistoryPeriod(value);
                  if (selectedUser) {
                    fetchLoginHistory(selectedUser.id);
                  }
                }}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">Last 30 Days</SelectItem>
                    <SelectItem value="3months">Last 3 Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Login History Table */}
              {loginHistoryLoading ? (
                <div className="text-center py-8">Loading login history...</div>
              ) : loginHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No login activity found for this period
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Date & Time</TableHead>
                        <TableHead className="whitespace-nowrap">Action</TableHead>
                        <TableHead className="whitespace-nowrap">IP Address</TableHead>
                        <TableHead className="whitespace-nowrap">Device/Browser</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loginHistory.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('en-UG', {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={log.action === 'LOGIN_SUCCESS' ? 'default' : 'destructive'}>
                              {log.action === 'LOGIN_SUCCESS' ? 'Logged In' : log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm break-all">{log.ip_address}</TableCell>
                          <TableCell className="text-sm text-gray-600 max-w-xs">
                            {log.user_agent ? (
                              <span className="break-words block" title={log.user_agent}>
                                <span className="hidden sm:inline\">{log.user_agent.length > 50
                                  ? log.user_agent.substring(0, 50) + '...'
                                  : log.user_agent}</span>
                                <span className="sm:hidden\">{log.user_agent.length > 30
                                  ? log.user_agent.substring(0, 30) + '...'
                                  : log.user_agent}</span>
                              </span>
                            ) : 'Unknown'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Summary */}
              {loginHistory.length > 0 && (
                <div className="bg-muted p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Logins:</span>
                      <span className="ml-2 font-semibold">{loginHistory.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Login:</span>
                      <span className="ml-2 font-semibold">
                        {selectedUser?.last_login
                          ? new Date(selectedUser.last_login).toLocaleString('en-UG', {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })
                          : 'Never'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setShowLoginHistoryDialog(false)} className="w-full sm:w-auto">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default UserManagement;
