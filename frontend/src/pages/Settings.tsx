import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { Settings as SettingsIcon, Building, Users, Bell, Shield, Palette, Database, AlertTriangle, AlertCircle, Trash2, Clock, Megaphone, Tag, Send, Calendar, Percent, Download, Mail, History, FileJson, Users2, Package, Truck, MessageSquare, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import axios, { AxiosError } from 'axios';

interface BusinessHoursDay {
  open: string;
  close: string;
  closed: boolean;
}

interface BranchRecord {
  id: number;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  location?: string | null;
  address?: string | null;
  is_active: boolean;
  is_default: boolean;
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

interface Promotion {
  id: number;
  name: string;
  description?: string;
  discount_percentage?: number;
  start_date: string;
  end_date: string;
  message: string;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING';
  created_at: string;
  sms_sent: boolean;
  sms_sent_at?: string;
  is_active: boolean;
}

interface BackupStats {
  totalOrders: number;
  totalCustomers: number;
  totalRevenue: number;
  lastBackup?: string;
  customers: number;
  orders: number;
  inventory: number;
  deliveries: number;
}

interface BackupHistoryItem {
  id: number;
  type: string;
  created_at: string;
  created_by: number;
  file_size?: number;
}

export default function Settings() {
  const { token, user, isAdmin, isCashier } = useAuth();
  const { toast } = useToast();
  const isManager = user?.role === 'MANAGER';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedYear, setSelectedYear] = useState('');
  const [orderStats, setOrderStats] = useState<{ count: number; totalAmount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [businessHours, setBusinessHours] = useState<BusinessHours>({
    monday: { open: '07:00', close: '21:00', closed: false },
    tuesday: { open: '07:00', close: '21:00', closed: false },
    wednesday: { open: '07:00', close: '21:00', closed: false },
    thursday: { open: '07:00', close: '21:00', closed: false },
    friday: { open: '07:00', close: '21:00', closed: false },
    saturday: { open: '07:00', close: '21:00', closed: false },
    sunday: { open: '09:00', close: '15:00', closed: false },
  });
  const [savingHours, setSavingHours] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);

  // URA Compliance state
  const [uraComplianceEnabled, setUraComplianceEnabled] = useState(false);
  const [businessTin, setBusinessTin] = useState('');
  const [fiscalDeviceNumber, setFiscalDeviceNumber] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');

  // Business identity (shown on every receipt / WhatsApp message)
  const [businessName, setBusinessName] = useState('');
  const [businessLocation, setBusinessLocation] = useState('');
  const [savingBusinessInfo, setSavingBusinessInfo] = useState(false);

  // Branches
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [savingBranch, setSavingBranch] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', location: '', phone: '', email: '' });
  const [vatRate, setVatRate] = useState('18.00');
  const [enableEfris, setEnableEfris] = useState(false);
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [invoiceFooter, setInvoiceFooter] = useState('');
  const [savingURASettings, setSavingURASettings] = useState(false);

  // Bargain limits are held as text so the field can be emptied while typing;
  // a numeric state would immediately snap a cleared box back to "0".
  const [desktopAgentBargainLimit, setDesktopAgentBargainLimit] = useState('5000');
  const [managerBargainLimit, setManagerBargainLimit] = useState('10000');
  const [savingBargainLimits, setSavingBargainLimits] = useState(false);

  // Payment accounts for on-account / partial WhatsApp receipts
  const [centenaryAccount, setCentenaryAccount] = useState('3205564146');
  const [mtnCode, setMtnCode] = useState('30353491');
  const [airtelMerchant, setAirtelMerchant] = useState('4403961');
  const [savingPaymentAccounts, setSavingPaymentAccounts] = useState(false);

  // Promotions state
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promoName, setPromoName] = useState('');
  const [promoDescription, setPromoDescription] = useState('');
  const [promoDiscount, setPromoDiscount] = useState('');
  const [promoStartDate, setPromoStartDate] = useState('');
  const [promoStartTime, setPromoStartTime] = useState('09:00');
  const [promoEndDate, setPromoEndDate] = useState('');
  const [promoEndTime, setPromoEndTime] = useState('18:00');
  const [promoMessage, setPromoMessage] = useState('');
  const [creatingPromo, setCreatingPromo] = useState(false);
  const [loadingPromos, setLoadingPromos] = useState(false);

  // Backup state
  const [backupStats, setBackupStats] = useState<BackupStats | null>(null);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [selectedBackupType, setSelectedBackupType] = useState('all');
  const [backupHistory, setBackupHistory] = useState<BackupHistoryItem[]>([]);
  
  // Email backup settings
  const [emailBackupEnabled, setEmailBackupEnabled] = useState(false);
  const [backupEmail, setBackupEmail] = useState('');
  const [backupFrequency, setBackupFrequency] = useState('daily');
  const [savingEmailSettings, setSavingEmailSettings] = useState(false);
  
  // Backup categories selection
  const [backupCategories, setBackupCategories] = useState<string[]>(['orders', 'customers', 'payments']);
  
  // Daily email backup state
  const [sendingDailyBackup, setSendingDailyBackup] = useState(false);

  // Session timeout state - load from user object
  const [sessionTimeout, setSessionTimeout] = useState<number>(15);

  // WhatsApp Automation Settings
  const [whatsappAutoSendReceipt, setWhatsappAutoSendReceipt] = useState(true);
  const [whatsappAutoSendReady, setWhatsappAutoSendReady] = useState(true);
  const [whatsappAutoSendDelivered, setWhatsappAutoSendDelivered] = useState(false);
  const [loadingAutomation, setLoadingAutomation] = useState(false);

  // Reminder Automation Settings
  const [reminderAutomationEnabled, setReminderAutomationEnabled] = useState(false);
  const [reminderChannels, setReminderChannels] = useState<string[]>(['sms']);
  const [savingReminders, setSavingReminders] = useState(false);

  // Notification Bell Settings
  const [notifyIncomingPayments, setNotifyIncomingPayments] = useState(true);
  const [notifyStaffAnnouncements, setNotifyStaffAnnouncements] = useState(true);
  const [notifyOverdueOrders, setNotifyOverdueOrders] = useState(true);
  const [notifyLowStock, setNotifyLowStock] = useState(true);
  const [notifyOrderReady, setNotifyOrderReady] = useState(true);
  const [enableNotificationSound, setEnableNotificationSound] = useState(true);
  const [enableDesktopNotifications, setEnableDesktopNotifications] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);

  // Fetch automation settings
  const fetchAutomationSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/automation-settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const settings = response.data.settings;
      setWhatsappAutoSendReceipt(settings.whatsapp_auto_send_receipt ?? true);
      setWhatsappAutoSendReady(settings.whatsapp_auto_send_ready ?? true);
      setWhatsappAutoSendDelivered(settings.whatsapp_auto_send_delivered ?? false);
    } catch (error) {
      console.error('Failed to fetch automation settings:', error);
    }
  }, [token]);

  // Fetch reminder automation settings
  const fetchReminderSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/reminders/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const settings = response.data.settings;
      setReminderAutomationEnabled(settings.enabled ?? false);
      setReminderChannels(settings.channels ?? ['sms']);
    } catch (error) {
      console.error('Failed to fetch reminder settings:', error);
    }
  }, [token]);

  // Update reminder automation settings
  const updateReminderSettings = async (enabled: boolean, channels: string[]) => {
    try {
      setSavingReminders(true);
      await axios.put(
        `${API_BASE_URL}/reminders/settings`,
        {
          settings: {
            enabled,
            channels,
            reminders: {
              ready_for_collection: {
                enabled: true,
                after_days: 1,
                repeat_every_days: 3,
                max_reminders: 3
              },
              payment_overdue: {
                enabled: true,
                after_days: 1,
                repeat_every_days: 7,
                max_reminders: 4
              },
              partial_payment: {
                enabled: true,
                after_days: 2,
                repeat_every_days: 5,
                max_reminders: 3
              }
            }
          }
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast({
        title: 'Reminder Settings Updated',
        description: `Automated reminders ${enabled ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: 'Failed to update reminder settings',
        variant: 'destructive',
      });
    } finally {
      setSavingReminders(false);
    }
  };

  // Load session timeout from user object whenever component mounts or user changes
  useEffect(() => {
    if (user?.session_timeout_minutes) {
      setSessionTimeout(user.session_timeout_minutes);
    } else {
      setSessionTimeout(15);
    }
  }, [user?.session_timeout_minutes]);

  // Load URA settings
  const fetchURASettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const settings = response.data;
      setUraComplianceEnabled(settings.ura_compliance_enabled === 'true' || settings.ura_compliance_enabled === true);
      setBusinessTin(settings.business_tin || '');
      setFiscalDeviceNumber(settings.fiscal_device_number || '');
      setBusinessAddress(settings.business_address || '');
      setBusinessPhone(settings.business_phone || '');
      setBusinessEmail(settings.business_email || '');
      setBusinessName(settings.business_name || 'Lush Dry Cleaners & Laundromat');
      setBusinessLocation(settings.business_location || '');
      setVatRate(settings.vat_rate || '18.00');
      setEnableEfris(settings.enable_efris === 'true' || settings.enable_efris === true);
      setInvoicePrefix(settings.invoice_prefix || 'INV');
      setInvoiceFooter(settings.invoice_footer_text || '');
      
      // Automatically set backup email to business email
      if (settings.business_email) {
        setBackupEmail(settings.business_email);
      }
    } catch (error) {
      console.error('Failed to load URA settings:', error);
    }
  }, [token]);

  // Load bargain limits
  const fetchBargainLimits = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/bargain-limits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setDesktopAgentBargainLimit(String(response.data.desktop_agent ?? 5000));
      setManagerBargainLimit(String(response.data.manager ?? 10000));
    } catch (error) {
      console.error('Failed to load bargain limits:', error);
    }
  }, [token]);

  const fetchBranches = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/branches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBranches(response.data.branches || []);
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchURASettings();
    if (isAdmin) {
      fetchBranches();
      fetchBargainLimits();
      axios
        .get(`${API_BASE_URL}/settings/payment-accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => {
          setCentenaryAccount(res.data.centenary_account || '3205564146');
          setMtnCode(res.data.mtn_code || '30353491');
          setAirtelMerchant(res.data.airtel_merchant || '4403961');
        })
        .catch(() => undefined);
    }
  }, [fetchURASettings, fetchBargainLimits, fetchBranches, isAdmin, token]);

  const branchErrorMessage = (error: unknown, fallback: string) => {
    const axiosError = error as { response?: { data?: { error?: string } } };
    return axiosError.response?.data?.error || fallback;
  };

  const createBranch = async () => {
    if (!newBranch.name.trim()) {
      toast({
        title: 'Branch name required',
        description: 'Give the branch a name staff will recognise.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSavingBranch(true);
      await axios.post(`${API_BASE_URL}/branches`, newBranch, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: 'Branch added', description: `${newBranch.name} is now available on new orders.` });
      setNewBranch({ name: '', location: '', phone: '', email: '' });
      fetchBranches();
    } catch (error) {
      toast({
        title: 'Error',
        description: branchErrorMessage(error, 'Failed to add branch'),
        variant: 'destructive',
      });
    } finally {
      setSavingBranch(false);
    }
  };

  const updateBranch = async (id: number, changes: Record<string, unknown>) => {
    try {
      setSavingBranch(true);
      await axios.put(`${API_BASE_URL}/branches/${id}`, changes, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchBranches();
    } catch (error) {
      toast({
        title: 'Error',
        description: branchErrorMessage(error, 'Failed to update branch'),
        variant: 'destructive',
      });
    } finally {
      setSavingBranch(false);
    }
  };

  const deleteBranch = async (id: number, name: string) => {
    if (!window.confirm(`Delete the branch "${name}"? This cannot be undone.`)) return;

    try {
      setSavingBranch(true);
      await axios.delete(`${API_BASE_URL}/branches/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: 'Branch deleted', description: `${name} was removed.` });
      fetchBranches();
    } catch (error) {
      toast({
        title: 'Branch not deleted',
        description: branchErrorMessage(error, 'Failed to delete branch'),
        variant: 'destructive',
      });
      fetchBranches();
    } finally {
      setSavingBranch(false);
    }
  };

  const saveBusinessInfo = async () => {
    if (!businessName.trim()) {
      toast({
        title: 'Business name required',
        description: 'Enter the business name that should appear on receipts.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSavingBusinessInfo(true);
      await axios.post(
        `${API_BASE_URL}/settings/bulk-update`,
        {
          settings: {
            business_name: businessName.trim(),
            business_phone: businessPhone.trim(),
            business_email: businessEmail.trim(),
            business_location: businessLocation.trim(),
            business_address: businessAddress.trim(),
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Business information saved',
        description: 'These details now appear on receipts and WhatsApp messages.',
      });
      fetchURASettings();
    } catch (error) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Error',
        description: axiosError.response?.data?.error || 'Failed to save business information',
        variant: 'destructive',
      });
    } finally {
      setSavingBusinessInfo(false);
    }
  };

  const savePaymentAccounts = async () => {
    try {
      setSavingPaymentAccounts(true);
      await axios.put(
        `${API_BASE_URL}/settings/payment-accounts`,
        {
          centenary_account: centenaryAccount,
          mtn_code: mtnCode,
          airtel_merchant: airtelMerchant,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: 'Payment accounts saved',
        description: 'These details appear on unpaid / partial / on-account WhatsApp receipts.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save payment accounts',
        variant: 'destructive',
      });
    } finally {
      setSavingPaymentAccounts(false);
    }
  };

  const saveURASettings = async () => {
    try {
      setSavingURASettings(true);
      
      const settings = {
        ura_compliance_enabled: uraComplianceEnabled.toString(),
        business_tin: businessTin,
        fiscal_device_number: fiscalDeviceNumber,
        business_address: businessAddress,
        business_phone: businessPhone,
        business_email: businessEmail,
        vat_rate: vatRate,
        enable_efris: enableEfris.toString(),
        invoice_prefix: invoicePrefix,
        invoice_footer_text: invoiceFooter,
      };

      await axios.post(
        `${API_BASE_URL}/settings/bulk-update`,
        { settings },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'URA settings updated',
        description: 'Your URA compliance settings have been saved successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update URA settings',
        variant: 'destructive',
      });
    } finally {
      setSavingURASettings(false);
    }
  };

  // Save bargain limits for all roles
  const saveBargainLimits = async () => {
    const desktopAgent = Math.max(0, Math.round(Number(desktopAgentBargainLimit) || 0));
    const manager = Math.max(0, Math.round(Number(managerBargainLimit) || 0));

    if (manager < desktopAgent) {
      toast({
        title: 'Check the limits',
        description: 'The manager limit should not be lower than the desktop agent limit.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSavingBargainLimits(true);

      await axios.post(
        `${API_BASE_URL}/settings/bargain-limits`,
        {
          desktop_agent_limit: desktopAgent,
          manager_limit: manager,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setDesktopAgentBargainLimit(String(desktopAgent));
      setManagerBargainLimit(String(manager));

      toast({
        title: 'Bargain limits updated',
        description: `Desktop agent ${desktopAgent.toLocaleString()} UGX, manager ${manager.toLocaleString()} UGX. Administrators are not capped.`,
      });
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      toast({
        title: 'Error',
        description: axiosError.response?.data?.error || 'Failed to update bargain limits',
        variant: 'destructive',
      });
    } finally {
      setSavingBargainLimits(false);
    }
  };

  // Get available years for deletion (current year - 3 to current year - 10)
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 8 }, (_, i) => currentYear - 3 - i);

  const fetchBusinessHours = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/business-hours`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBusinessHours(response.data);
    } catch (error) {
      console.error('Failed to fetch business hours:', error);
    }
  }, [token]);

  const saveBusinessHours = async () => {
    try {
      setSavingHours(true);
      await axios.put(
        `${API_BASE_URL}/settings/business-hours`,
        businessHours,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: 'Business hours updated',
        description: 'Your business hours have been saved successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update business hours',
        variant: 'destructive',
      });
    } finally {
      setSavingHours(false);
    }
  };

  const updateDayHours = (day: keyof BusinessHours, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    setBusinessHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value
      }
    }));
  };

  const sendAnnouncement = async () => {
    if (!announcementTitle.trim()) {
      toast({
        title: 'Error',
        description: 'Announcement title is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSendingAnnouncement(true);
      await axios.post(
        `${API_BASE_URL}/notifications`,
        {
          type: 'ANNOUNCEMENT',
          title: announcementTitle,
          message: announcementMessage,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: 'Announcement sent',
        description: 'All staff will be notified.',
      });
      setAnnouncementTitle('');
      setAnnouncementMessage('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send announcement',
        variant: 'destructive',
      });
    } finally {
      setSendingAnnouncement(false);
    }
  };

  const fetchOrderStats = async (year: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/orders/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { 
          year,
          status: 'DELIVERED',
          payment_status: 'PAID'
        },
      });
      setOrderStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleDeleteOrders = useCallback(async () => {
    if (!selectedYear) return;
    
    try {
      setIsLoading(true);
      await axios.post(
        `${API_BASE_URL}/orders/bulk-delete`,
        { year: selectedYear },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast({
        title: 'Success',
        description: `Deleted ${orderStats?.count || 0} orders from ${selectedYear}`,
      });
      
      setShowDeleteDialog(false);
      setSelectedYear('');
      setOrderStats(null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete orders. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [token, selectedYear, orderStats, toast]);

  const fetchPromotions = useCallback(async () => {
    try {
      setLoadingPromos(true);
      const response = await axios.get(`${API_BASE_URL}/promotions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPromotions(response.data.promotions || []);
    } catch (error) {
      console.error('Failed to fetch promotions:', error);
    } finally {
      setLoadingPromos(false);
    }
  }, [token]);

  const createPromotion = async () => {
    if (!promoName || !promoStartDate || !promoEndDate || !promoMessage) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please fill in all required fields',
      });
      return;
    }

    try {
      setCreatingPromo(true);
      
      const startDateTime = `${promoStartDate}T${promoStartTime}:00`;
      const endDateTime = `${promoEndDate}T${promoEndTime}:00`;

      await axios.post(
        `${API_BASE_URL}/promotions`,
        {
          name: promoName,
          description: promoDescription,
          discount_percentage: promoDiscount ? parseInt(promoDiscount) : null,
          start_date: startDateTime,
          end_date: endDateTime,
          message: promoMessage,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Promotion Created',
        description: 'Your promotion has been created successfully',
      });

      // Reset form
      setPromoName('');
      setPromoDescription('');
      setPromoDiscount('');
      setPromoStartDate('');
      setPromoEndDate('');
      setPromoMessage('');
      
      fetchPromotions();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create promotion',
      });
    } finally {
      setCreatingPromo(false);
    }
  };

  const activatePromotion = async (id: number, promoName: string) => {
    if (!confirm(`Send promotional SMS to all customers for "${promoName}"?\n\nThis will send SMS to all active customers with phone numbers.`)) {
      return;
    }

    try {
      const response = await axios.post(
        `${API_BASE_URL}/promotions/${id}/activate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Promotion Activated',
        description: `SMS will be sent to ${response.data.customers_count} customers`,
      });

      fetchPromotions();
    } catch (error: unknown) {
      let errorMessage = 'Failed to activate promotion';
      if (axios.isAxiosError(error)) {
        errorMessage = error.response?.data?.error || error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    }
  };

  const deletePromotion = async (id: number) => {
    if (!confirm('Are you sure you want to delete this promotion?')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/promotions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast({
        title: 'Promotion Deleted',
        description: 'The promotion has been removed',
      });

      fetchPromotions();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete promotion',
      });
    }
  };

  const generatePromoMessage = () => {
    const discount = promoDiscount ? `${promoDiscount}% OFF` : 'Special Offer';
    const name = promoName || 'Our Special Event';
    
    const template = `🎉 ${name.toUpperCase()}! 🎉

${discount} on all laundry services!

Valid until: ${promoEndDate ? new Date(promoEndDate).toLocaleDateString('en-GB') : '[End Date]'}

Visit Lush Laundry and enjoy this amazing offer!

📍 Location: [Your Address]
📞 Call: [Your Phone]

Don't miss out! ✨`;

    setPromoMessage(template);
  };

  // Backup functions
  const fetchBackupStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/backup/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBackupStats(response.data);
    } catch (error) {
      console.error('Failed to fetch backup stats:', error);
    }
  }, [token]);

  const handleDownloadBackup = async () => {
    try {
      setIsDownloadingBackup(true);
      
      const response = await axios.post(
        `${API_BASE_URL}/backup/create`,
        { tables: selectedBackupType }, // Support different backup types
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob', // Important for file download
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Set filename with current date and type
      const date = new Date().toISOString().split('T')[0];
      const typeLabel = selectedBackupType === 'all' ? 'full' : selectedBackupType.replace(',', '_');
      link.setAttribute('download', `lush_laundry_${typeLabel}_backup_${date}.json`);
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Backup Downloaded',
        description: `Your ${typeLabel} backup has been downloaded successfully`,
      });
      
      // Refresh backup history
      fetchBackupHistory();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create backup',
      });
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const fetchBackupHistory = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/backup/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBackupHistory(response.data.slice(0, 5)); // Show last 5 backups
    } catch (error) {
      console.error('Failed to fetch backup history:', error);
    }
  }, [token]);

  const fetchEmailBackupSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/backup/email-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data) {
        setEmailBackupEnabled(response.data.enabled || false);
        setBackupEmail(response.data.email || '');
        setBackupFrequency(response.data.frequency || 'weekly');
      }
    } catch (error) {
      console.error('Failed to fetch email backup settings:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchBusinessHours();
    fetchPromotions();
    fetchBackupStats();
    fetchBackupHistory();
    fetchEmailBackupSettings();
    fetchAutomationSettings();
    fetchReminderSettings();
  }, [fetchBusinessHours, fetchPromotions, fetchBackupStats, fetchBackupHistory, fetchEmailBackupSettings, fetchAutomationSettings, fetchReminderSettings]);

  const handleSaveAutomation = async (settingKey: string, value: boolean) => {
    try {
      setLoadingAutomation(true);
      await axios.put(
        `${API_BASE_URL}/automation-settings`,
        {
          whatsapp_auto_send_receipt: settingKey === 'receipt' ? value : whatsappAutoSendReceipt,
          whatsapp_auto_send_ready: settingKey === 'ready' ? value : whatsappAutoSendReady,
          whatsapp_auto_send_delivered: settingKey === 'delivered' ? value : whatsappAutoSendDelivered,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update local state
      if (settingKey === 'receipt') setWhatsappAutoSendReceipt(value);
      if (settingKey === 'ready') setWhatsappAutoSendReady(value);
      if (settingKey === 'delivered') setWhatsappAutoSendDelivered(value);

      toast({
        title: 'Automation Updated',
        description: `WhatsApp automation ${value ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error) {
      console.error('Failed to update automation settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to update automation settings',
        variant: 'destructive',
      });
    } finally {
      setLoadingAutomation(false);
    }
  };

  const saveEmailBackupSettings = async () => {
    try {
      setSavingEmailSettings(true);
      await axios.post(
        `${API_BASE_URL}/backup/email-settings`,
        {
          enabled: emailBackupEnabled,
          email: backupEmail,
          frequency: backupFrequency,
          categories: backupCategories,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: 'Settings Saved',
        description: emailBackupEnabled 
          ? `Automatic backups will be sent to ${backupEmail} ${backupFrequency} with ${backupCategories.length} categories` 
          : 'Automatic email backups disabled',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save email backup settings',
      });
    } finally {
      setSavingEmailSettings(false);
    }
  };

  const sendDailyBackupNow = async () => {
    try {
      setSendingDailyBackup(true);
      const response = await axios.post(
        `${API_BASE_URL}/backup/email/send-now`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: 'Daily Backup Sent',
        description: `Successfully sent to ${response.data.sentTo?.length || 0} administrator(s)`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send daily backup email',
      });
    } finally {
      setSendingDailyBackup(false);
    }
  };

  // Toggle backup category selection
  const toggleBackupCategory = (category: string) => {
    setBackupCategories(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  return (
    <MainLayout 
      title={isAdmin ? "Settings" : "My Account"} 
      subtitle={isAdmin ? "Configure your ERP system" : "Manage your personal account settings"}
    >
      <div className="max-w-4xl space-y-6">
        {/* Quick Navigation - Hidden for Cashiers */}
        {isAdmin && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-xl border border-border shadow-sm p-6">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            Quick Navigation
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <button
              onClick={() => document.getElementById('business-info')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-left"
            >
              <Building className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Business Info</span>
            </button>
            <button
              onClick={() => document.getElementById('business-hours')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors text-left"
            >
              <Clock className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Business Hours</span>
            </button>
            <button
              onClick={() => document.getElementById('notifications')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-900/30 transition-colors text-left"
            >
              <Bell className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">Notifications</span>
            </button>
            <button
              onClick={() => document.getElementById('security')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors text-left"
            >
              <Shield className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Security</span>
            </button>
            <button
              onClick={() => document.getElementById('data-management')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors text-left"
            >
              <Database className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">Data Management</span>
            </button>
          </div>
        </div>
        )}

        {/* Business Information - Admin Only */}
        {isAdmin && (
        <div id="business-info" className="bg-card rounded-xl border border-border shadow-sm scroll-mt-6">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <Building className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Business Information</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              These details appear on printed receipts, invoices and WhatsApp messages.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="businessName">Business Name *</Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Lush Dry Cleaners & Laundromat"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  placeholder="+256700123456"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  placeholder="info@lushdrycleaners.ug"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={businessLocation}
                  onChange={(e) => setBusinessLocation(e.target.value)}
                  placeholder="Kampala, Uganda"
                  className="mt-2"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="business-street-address">Street Address</Label>
                <Input
                  id="business-street-address"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  placeholder="Plot 123, Kampala Road"
                  className="mt-2"
                />
              </div>
            </div>
            <Button
              onClick={saveBusinessInfo}
              disabled={savingBusinessInfo}
              className="bg-secondary hover:bg-secondary/90 text-secondary-foreground"
            >
              {savingBusinessInfo ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
        )}

        {/* Branches - Admin Only */}
        {isAdmin && (
        <div id="branches" className="bg-card rounded-xl border border-border shadow-sm scroll-mt-6">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <Building className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Branches</h2>
                <p className="text-sm text-muted-foreground">
                  Each order is recorded against a branch. Staff are assigned a branch in User Management.
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              {branches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No branches yet. Add your first branch below.</p>
              ) : (
                branches.map((branch) => (
                  <div
                    key={branch.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{branch.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{branch.code}</span>
                        {branch.is_default && (
                          <span className="text-xs rounded bg-primary/10 text-primary px-2 py-0.5">Default</span>
                        )}
                        {!branch.is_active && (
                          <span className="text-xs rounded bg-muted text-muted-foreground px-2 py-0.5">Inactive</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {[branch.location, branch.phone].filter(Boolean).join(' · ') || 'No location set'}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!branch.is_default && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={savingBranch}
                          onClick={() => updateBranch(branch.id, { is_default: true })}
                        >
                          Make default
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={savingBranch}
                        onClick={() => updateBranch(branch.id, { is_active: !branch.is_active })}
                      >
                        {branch.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      {!branch.is_default && (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={savingBranch}
                          onClick={() => deleteBranch(branch.id, branch.name)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-lg border border-dashed border-border p-4 space-y-4">
              <h3 className="font-medium">Add a branch</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="new-branch-name">Branch Name *</Label>
                  <Input
                    id="new-branch-name"
                    value={newBranch.name}
                    onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                    placeholder="Branch Two — Ntinda"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="new-branch-location">Location</Label>
                  <Input
                    id="new-branch-location"
                    value={newBranch.location}
                    onChange={(e) => setNewBranch({ ...newBranch, location: e.target.value })}
                    placeholder="Ntinda, Kampala"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="new-branch-phone">Phone</Label>
                  <Input
                    id="new-branch-phone"
                    value={newBranch.phone}
                    onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
                    placeholder="+256700123456"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="new-branch-email">Email</Label>
                  <Input
                    id="new-branch-email"
                    type="email"
                    value={newBranch.email}
                    onChange={(e) => setNewBranch({ ...newBranch, email: e.target.value })}
                    placeholder="ntinda@lushdrycleaners.ug"
                    className="mt-2"
                  />
                </div>
              </div>
              <Button onClick={createBranch} disabled={savingBranch}>
                {savingBranch ? 'Saving…' : 'Add Branch'}
              </Button>
            </div>
          </div>
        </div>
        )}

        {/* Notifications - Admin Only */}
        {isAdmin && (
        <div id="notifications" className="bg-card rounded-xl border border-border shadow-sm scroll-mt-6">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Notification Bell Settings</h2>
                <p className="text-sm text-muted-foreground">Control what appears in the notification bell</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">NOTIFICATION TYPES</h3>
              
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Incoming Payments</p>
                  <p className="text-sm text-muted-foreground">Notify when payment APIs receive new payments</p>
                </div>
                <Switch 
                  checked={notifyIncomingPayments}
                  onCheckedChange={setNotifyIncomingPayments}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Staff Announcements</p>
                  <p className="text-sm text-muted-foreground">Notify when admin posts announcements</p>
                </div>
                <Switch 
                  checked={notifyStaffAnnouncements}
                  onCheckedChange={setNotifyStaffAnnouncements}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Overdue Orders</p>
                  <p className="text-sm text-muted-foreground">Notify when orders become overdue</p>
                </div>
                <Switch 
                  checked={notifyOverdueOrders}
                  onCheckedChange={setNotifyOverdueOrders}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Order Ready</p>
                  <p className="text-sm text-muted-foreground">Notify when orders are marked as ready</p>
                </div>
                <Switch 
                  checked={notifyOrderReady}
                  onCheckedChange={setNotifyOrderReady}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Low Stock Alerts</p>
                  <p className="text-sm text-muted-foreground">Notify when inventory items are low</p>
                </div>
                <Switch 
                  checked={notifyLowStock}
                  onCheckedChange={setNotifyLowStock}
                />
              </div>
            </div>

            <div className="border-t pt-6 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">NOTIFICATION BEHAVIOR</h3>
              
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Notification Sound</p>
                  <p className="text-sm text-muted-foreground">Play sound when new notifications arrive</p>
                </div>
                <Switch 
                  checked={enableNotificationSound}
                  onCheckedChange={setEnableNotificationSound}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Desktop Notifications</p>
                  <p className="text-sm text-muted-foreground">Show browser notifications (requires permission)</p>
                </div>
                <Switch 
                  checked={enableDesktopNotifications}
                  onCheckedChange={setEnableDesktopNotifications}
                />
              </div>
            </div>

            <Alert>
              <Bell className="h-4 w-4" />
              <AlertDescription>
                The notification bell in the top header shows: incoming payments from APIs, staff announcements, 
                overdue orders, order ready alerts, and low stock warnings. Configure which types you want to see.
              </AlertDescription>
            </Alert>

            <Button 
              onClick={async () => {
                setSavingNotifications(true);
                // Here you would save to backend
                await new Promise(resolve => setTimeout(resolve, 500));
                setSavingNotifications(false);
                toast({ title: 'Notification settings saved' });
              }}
              disabled={savingNotifications}
              className="w-full"
            >
              {savingNotifications ? 'Saving...' : 'Save Notification Settings'}
            </Button>
          </div>
        </div>
        )}

        {/* Message Automation - Admin/Manager Only */}
        {(isAdmin || isManager) && (
        <div id="message-automation" className="bg-card rounded-xl border border-border shadow-sm scroll-mt-6">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Message Automation</h2>
                <p className="text-sm text-muted-foreground">
                  API auto-send (Twilio / Africa&apos;s Talking) when configured. Without an API, use Orders → WhatsApp Messenger to send manually from your business phone or WhatsApp Desktop.
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            {/* WhatsApp Automation */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">WhatsApp Auto-Send (API)</h3>
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-100">
                These toggles only work when WhatsApp Business API credentials are set in the server <code className="text-xs">.env</code>.
                If automation is off or unavailable, staff can still open <strong>Orders → Send Receipt / Notify Ready</strong> and send via WhatsApp Messenger.
                Your business number is stored as <strong>Business Phone</strong> under URA / business settings and included on messages.
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Order Receipt</p>
                  <p className="text-sm text-muted-foreground">Auto-send when order is created (API only)</p>
                </div>
                <Switch 
                  checked={whatsappAutoSendReceipt}
                  onCheckedChange={(value) => handleSaveAutomation('receipt', value)}
                  disabled={loadingAutomation}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Order Ready</p>
                  <p className="text-sm text-muted-foreground">Auto-send when status becomes READY (API only)</p>
                </div>
                <Switch 
                  checked={whatsappAutoSendReady}
                  onCheckedChange={(value) => handleSaveAutomation('ready', value)}
                  disabled={loadingAutomation}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Order Delivered</p>
                  <p className="text-sm text-muted-foreground">Auto-send when order is delivered (API only)</p>
                </div>
                <Switch 
                  checked={whatsappAutoSendDelivered}
                  onCheckedChange={(value) => handleSaveAutomation('delivered', value)}
                  disabled={loadingAutomation}
                />
              </div>
            </div>

            <div className="border-t pt-6 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Customer Reminder Automation</h3>
              
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Enable Automatic Reminders</p>
                  <p className="text-sm text-muted-foreground">Automatically remind customers about orders</p>
                </div>
                <Switch 
                  checked={reminderAutomationEnabled}
                  onCheckedChange={setReminderAutomationEnabled}
                />
              </div>

              {reminderAutomationEnabled && (
                <>
                  <div className="ml-0 sm:ml-4 space-y-4 bg-muted/30 rounded-lg p-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Reminder Channels</Label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="reminder-sms"
                            checked={reminderChannels.includes('sms')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setReminderChannels([...reminderChannels, 'sms']);
                              } else {
                                setReminderChannels(reminderChannels.filter(c => c !== 'sms'));
                              }
                            }}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="reminder-sms" className="text-sm cursor-pointer">SMS</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="reminder-whatsapp"
                            checked={reminderChannels.includes('whatsapp')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setReminderChannels([...reminderChannels, 'whatsapp']);
                              } else {
                                setReminderChannels(reminderChannels.filter(c => c !== 'whatsapp'));
                              }
                            }}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="reminder-whatsapp" className="text-sm cursor-pointer">WhatsApp</Label>
                        </div>
                      </div>
                    </div>

                    <Alert>
                      <Bell className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Automatic Reminder Rules:</strong>
                        <ul className="mt-2 ml-4 text-sm space-y-1 list-disc">
                          <li>READY orders: Remind 1 day after order is ready</li>
                          <li>Overdue payments: Remind 7 days after due date</li>
                          <li>Partial payments: Remind when balance remains unpaid</li>
                        </ul>
                      </AlertDescription>
                    </Alert>

                    <Button
                      onClick={() => updateReminderSettings(reminderAutomationEnabled, reminderChannels)}
                      disabled={savingReminders || reminderChannels.length === 0}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {savingReminders ? 'Saving...' : 'Save Reminder Settings'}
                    </Button>
                  </div>
                </>
              )}
            </div>

            <Alert>
              <MessageSquare className="h-4 w-4" />
              <AlertDescription>
                Message automation helps maintain customer communication without manual intervention. 
                Staff can still send manual reminders using the bell icon (🔔) in the Orders page.
              </AlertDescription>
            </Alert>
          </div>
        </div>
        )}

        {/* Business Hours - Admin Only */}
        {isAdmin && (
        <div id="business-hours" className="bg-card rounded-xl border border-border shadow-sm scroll-mt-6">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Business Hours</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {(Object.keys(businessHours) as Array<keyof BusinessHours>).map((day) => (
              <div key={day} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pb-3 border-b last:border-b-0">
                <div className="sm:w-28">
                  <p className="font-medium capitalize">{day}</p>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="time"
                    value={businessHours[day].open}
                    onChange={(e) => updateDayHours(day, 'open', e.target.value)}
                    disabled={businessHours[day].closed}
                    className="w-full sm:w-32"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="time"
                    value={businessHours[day].close}
                    onChange={(e) => updateDayHours(day, 'close', e.target.value)}
                    disabled={businessHours[day].closed}
                    className="w-full sm:w-32"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`${day}-closed`} className="text-sm text-muted-foreground">
                    Closed
                  </Label>
                  <Switch
                    id={`${day}-closed`}
                    checked={businessHours[day].closed}
                    onCheckedChange={(checked) => updateDayHours(day, 'closed', checked)}
                  />
                </div>
              </div>
            ))}
            <Button 
              onClick={saveBusinessHours}
              disabled={savingHours}
              className="bg-secondary hover:bg-secondary/90 text-secondary-foreground w-full sm:w-auto"
            >
              {savingHours ? 'Saving...' : 'Save Business Hours'}
            </Button>
          </div>
        </div>
        )}

        {/* Staff Announcements - Admin Only */}
        {isAdmin && (
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <Megaphone className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Staff Announcements</h2>
                <p className="text-sm text-muted-foreground">Send notifications to all staff members</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <Label htmlFor="announcement-title">Announcement Title</Label>
              <Input
                id="announcement-title"
                placeholder="e.g., Shop closes early Friday"
                value={announcementTitle}
                onChange={(e) => setAnnouncementTitle(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="announcement-message">Message (Optional)</Label>
              <Textarea
                id="announcement-message"
                placeholder="Add more details about this announcement..."
                value={announcementMessage}
                onChange={(e) => setAnnouncementMessage(e.target.value)}
                className="mt-2"
                rows={4}
              />
            </div>
            <Alert>
              <AlertDescription>
                This announcement will be sent to all staff members and appear in their notifications.
              </AlertDescription>
            </Alert>
            <Button
              onClick={sendAnnouncement}
              disabled={sendingAnnouncement || !announcementTitle.trim()}
              className="w-full sm:w-auto"
            >
              {sendingAnnouncement ? 'Sending...' : 'Send Announcement'}
            </Button>
          </div>
        </div>
        )}

        {/* URA Compliance Settings - Admin Only */}
        {isAdmin && (
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="p-6 border-b border-border">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">URA Compliance (Uganda Revenue Authority)</h2>
                  <p className="text-sm text-muted-foreground">Configure tax settings and EFRIS integration</p>
                </div>
              </div>
              
              {/* Master Toggle */}
              <div className="flex items-center gap-3">
                <Label htmlFor="ura-toggle" className="text-sm font-medium">
                  {uraComplianceEnabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  id="ura-toggle"
                  checked={uraComplianceEnabled}
                  onCheckedChange={setUraComplianceEnabled}
                />
              </div>
            </div>
            
            {/* Information Alert */}
            {!uraComplianceEnabled && (
              <Alert className="mt-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  URA Compliance is currently <strong>disabled</strong>. Your orders will not include VAT calculations, 
                  and invoices will not show TIN/FDN. Enable this when your business is registered with URA.
                </AlertDescription>
              </Alert>
            )}
            
            {uraComplianceEnabled && (
              <Alert className="mt-4 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <Shield className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  URA Compliance is <strong>active</strong>. All orders will include 18% VAT calculations, 
                  and invoices will display your TIN and FDN for tax compliance.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <div className="p-6 space-y-6">
            {/* Tax Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Tax Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="business-tin">Tax Identification Number (TIN) *</Label>
                  <Input
                    id="business-tin"
                    placeholder="e.g., 1234567890"
                    value={businessTin}
                    onChange={(e) => setBusinessTin(e.target.value)}
                    disabled={!uraComplianceEnabled}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Required on all invoices</p>
                </div>

                <div>
                  <Label htmlFor="fiscal-device-number">Fiscal Device Number (FDN)</Label>
                  <Input
                    id="fiscal-device-number"
                    placeholder="e.g., FDN-XXXX-XXXX"
                    value={fiscalDeviceNumber}
                    onChange={(e) => setFiscalDeviceNumber(e.target.value)}
                    disabled={!uraComplianceEnabled}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">EFRIS fiscal device identifier</p>
                </div>

                <div>
                  <Label htmlFor="vat-rate">VAT Rate (%)</Label>
                  <Input
                    id="vat-rate"
                    type="number"
                    step="0.01"
                    placeholder="18.00"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    disabled={!uraComplianceEnabled}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Current Uganda VAT: 18%</p>
                </div>

                <div>
                  <Label htmlFor="invoice-prefix">Invoice Number Prefix</Label>
                  <Input
                    id="invoice-prefix"
                    placeholder="INV"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    disabled={!uraComplianceEnabled}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Prefix for invoice numbers</p>
                </div>
              </div>
            </div>

            {/* Business Information */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Business Information</h3>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="business-address">Business Address *</Label>
                  <Input
                    id="business-address"
                    placeholder="e.g., Plot 123, Kampala Road, Kampala"
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    disabled={!uraComplianceEnabled}
                    className="mt-2"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="business-phone">Business Phone / WhatsApp *</Label>
                    <Input
                      id="business-phone"
                      placeholder="+256700000000"
                      value={businessPhone}
                      onChange={(e) => setBusinessPhone(e.target.value)}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Stored for receipts and WhatsApp messages. Log into WhatsApp Messenger with this business number on the shop phone/PC to send.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="business-email">Business Email</Label>
                    <Input
                      id="business-email"
                      type="email"
                      placeholder="info@lushlaundry.com"
                      value={businessEmail}
                      onChange={(e) => setBusinessEmail(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice Settings */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Invoice Settings</h3>
              
              <div>
                <Label htmlFor="invoice-footer">Invoice Footer Text</Label>
                <Textarea
                  id="invoice-footer"
                  placeholder="Thank you for choosing Lush Laundry Services!"
                  value={invoiceFooter}
                  onChange={(e) => setInvoiceFooter(e.target.value)}
                  disabled={!uraComplianceEnabled}
                  className="mt-2"
                  rows={2}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg bg-muted/50">
                <div className="space-y-0.5">
                  <Label htmlFor="enable-efris">Enable EFRIS Integration</Label>
                  <p className="text-sm text-muted-foreground">Connect to URA Electronic Fiscal Receipting System</p>
                </div>
                <Switch
                  id="enable-efris"
                  checked={enableEfris}
                  onCheckedChange={setEnableEfris}
                  disabled={!uraComplianceEnabled}
                />
              </div>

              {enableEfris && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    EFRIS integration requires additional configuration. Contact your system administrator for setup assistance.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                All invoices will include VAT calculations and your TIN. Ensure your TIN is correct before generating invoices for customers.
              </AlertDescription>
            </Alert>

            <Button
              onClick={saveURASettings}
              disabled={savingURASettings}
              className="bg-secondary hover:bg-secondary/90 text-secondary-foreground w-full sm:w-auto"
            >
              {savingURASettings ? 'Saving...' : 'Save URA Settings'}
            </Button>
          </div>
        </div>
        )}

        {/* Payment accounts for WhatsApp on-account / partial receipts - Admin Only */}
        {isAdmin && (
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Payment Mode Details</h2>
                <p className="text-sm text-muted-foreground">
                  Shown on unpaid, partial, and on-account WhatsApp receipts (not on fully paid orders)
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="centenary-account">Centenary account No</Label>
                <Input
                  id="centenary-account"
                  value={centenaryAccount}
                  onChange={(e) => setCentenaryAccount(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="mtn-code">MTN code no</Label>
                <Input
                  id="mtn-code"
                  value={mtnCode}
                  onChange={(e) => setMtnCode(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="airtel-merchant">Airtel merchant no</Label>
                <Input
                  id="airtel-merchant"
                  value={airtelMerchant}
                  onChange={(e) => setAirtelMerchant(e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
            <Button onClick={savePaymentAccounts} disabled={savingPaymentAccounts}>
              {savingPaymentAccounts ? 'Saving…' : 'Save payment modes'}
            </Button>
          </div>
        </div>
        )}

        {/* Bargain Limits - Admin Only */}
        {isAdmin && (
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <Percent className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Bargain Deduction Limits</h2>
                <p className="text-sm text-muted-foreground">Configure maximum bargain amounts by role</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Bargain deductions are <strong>fixed amounts</strong> (not percentages) that staff can negotiate with customers. 
                When staff apply a bargain, administrators are notified for tracking purposes.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Maximum Bargain Limits (UGX)</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="desktop-agent-limit">Desktop Agent Limit</Label>
                  <Input
                    id="desktop-agent-limit"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1000"
                    value={desktopAgentBargainLimit}
                    onChange={(e) => setDesktopAgentBargainLimit(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="5000"
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Recommended: 5,000 - 10,000 UGX</p>
                </div>

                <div>
                  <Label htmlFor="manager-limit">Manager Limit</Label>
                  <Input
                    id="manager-limit"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1000"
                    value={managerBargainLimit}
                    onChange={(e) => setManagerBargainLimit(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="10000"
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Recommended: 10,000 - 20,000 UGX</p>
                </div>

                <div>
                  <Label>Administrator Limit</Label>
                  <div className="mt-2 flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-medium">
                    No limit
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Administrators are never capped, up to the order value.
                  </p>
                </div>
              </div>
            </div>

            <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                <strong>How it works:</strong> When creating an order, if staff enter a bargain amount above their limit, 
                the system will show an error: "Beyond maximum bargaining limit". You'll receive a notification when bargain deductions are used.
              </AlertDescription>
            </Alert>

            <Button
              onClick={saveBargainLimits}
              disabled={savingBargainLimits}
              className="w-full sm:w-auto"
            >
              {savingBargainLimits ? 'Saving...' : 'Save Bargain Limits'}
            </Button>
          </div>
        </div>
        )}

        {/* Security - Available to All Users */}
        <div id="security" className="bg-card rounded-xl border border-border shadow-sm scroll-mt-6">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Security Settings</h2>
                <p className="text-sm text-muted-foreground">Manage session timeout and account security</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="font-medium mb-1">Password management has moved!</p>
                  <p className="text-sm">Change your password from your Profile page using the top-right menu.</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = '/profile'}
                  className="w-full sm:w-auto"
                >
                  Go to Profile
                </Button>
              </AlertDescription>
            </Alert>

            {/* Session Timeout Section */}
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Session Timeout
              </h3>
              
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertTitle>Automatic Security Logout</AlertTitle>
                <AlertDescription>
                  Your session will automatically expire after a period of inactivity to protect your account from unauthorized access.
                  You'll receive a warning 60 seconds before your session expires, giving you the option to stay logged in.
                </AlertDescription>
              </Alert>

              <p className="text-sm text-muted-foreground">
                Sessions expire after {sessionTimeout} minutes of inactivity. This is a
                fixed system-wide security setting.
              </p>

              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p className="text-sm font-medium">How it works:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Timer resets whenever you interact with the system</li>
                  <li>Warning appears 60 seconds before expiration</li>
                  <li>Click "Stay Logged In" to continue your session</li>
                  <li>System automatically logs you out if no action is taken</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Data Management - Admin Only */}
        {isAdmin && (
        <div id="data-management" className="bg-card rounded-xl border border-destructive/50 shadow-sm scroll-mt-6">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-destructive" />
              <h2 className="text-lg font-semibold">Data Management</h2>
              <span className="ml-auto text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">Admin Only</span>
            </div>
          </div>
          <div className="p-6 space-y-6">
            {/* Database Backup Section */}
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                Database Backup & Recovery
              </h3>

              <Alert>
                <AlertDescription>
                  Regular backups protect your business data. Choose what to backup and set up automatic email backups.
                  <br />
                  <strong>✅ Automatic backups will be emailed to administrators based on your schedule</strong>
                </AlertDescription>
              </Alert>

              {backupStats && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Users2 className="h-3 w-3" />
                      Customers
                    </div>
                    <div className="text-2xl font-bold">{backupStats.customers}</div>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <FileJson className="h-3 w-3" />
                      Orders
                    </div>
                    <div className="text-2xl font-bold">{backupStats.orders}</div>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      Inventory
                    </div>
                    <div className="text-2xl font-bold">{backupStats.inventory}</div>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Truck className="h-3 w-3" />
                      Deliveries
                    </div>
                    <div className="text-2xl font-bold">{backupStats.deliveries}</div>
                  </div>
                </div>
              )}

              {/* Manual Backup Download */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 p-5 rounded-lg border border-blue-200 dark:border-blue-800 space-y-4">
                <h4 className="font-medium flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <Download className="h-4 w-4" />
                  Manual Backup Download
                </h4>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="backupType" className="text-sm text-blue-700 dark:text-blue-300">
                      Select what to backup
                    </Label>
                    <Select value={selectedBackupType} onValueChange={setSelectedBackupType}>
                      <SelectTrigger id="backupType" className="mt-1 bg-white dark:bg-gray-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">🗄️ Full Backup (All Data)</SelectItem>
                        <SelectItem value="customers">👥 Customers Only</SelectItem>
                        <SelectItem value="orders,order_items">📋 Orders Only</SelectItem>
                        <SelectItem value="inventory_items,inventory_transactions">📦 Inventory Only</SelectItem>
                        <SelectItem value="deliveries">🚚 Deliveries Only</SelectItem>
                        <SelectItem value="customers,orders,order_items">👥📋 Customers + Orders</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button 
                    onClick={handleDownloadBackup}
                    disabled={isDownloadingBackup}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {isDownloadingBackup ? 'Creating Backup...' : 'Download Backup Now'}
                  </Button>
                </div>
              </div>

              {/* Automatic Email Backups */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 p-5 rounded-lg border border-purple-200 dark:border-purple-800 space-y-4">
                <h4 className="font-medium flex items-center gap-2 text-purple-700 dark:text-purple-300">
                  <Mail className="h-4 w-4" />
                  Automatic Email Backups
                </h4>
                
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium text-purple-700 dark:text-purple-300">
                        Enable automatic backups
                      </Label>
                      <p className="text-xs text-purple-600 dark:text-purple-400">
                        Backups will be sent to your email automatically
                      </p>
                    </div>
                    <Switch 
                      checked={emailBackupEnabled} 
                      onCheckedChange={setEmailBackupEnabled}
                    />
                  </div>

                  {emailBackupEnabled && (
                    <>
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                        <Label className="text-sm text-purple-700 dark:text-purple-300">
                          📧 Backup Email Address
                        </Label>
                        <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 mb-2">
                          Backups will be sent to the business email from Business Information settings
                        </p>
                        <div className="flex items-center gap-2 p-2 bg-white dark:bg-gray-900 rounded border border-purple-200 dark:border-purple-700">
                          <Mail className="h-4 w-4 text-purple-500" />
                          <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                            {backupEmail || businessEmail || 'No business email configured'}
                          </span>
                        </div>
                        <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                          💡 Update in Business Information section to change backup email
                        </p>
                      </div>

                      <div>
                        <Label className="text-sm text-purple-700 dark:text-purple-300">
                          📦 What to Include in Backups
                        </Label>
                        <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
                          Select which data categories to include in automatic backups
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white dark:bg-gray-900 p-3 rounded-lg border border-purple-200 dark:border-purple-700">
                          {[
                            { id: 'orders', label: '📋 Orders & Order Items', desc: 'All order records' },
                            { id: 'customers', label: '👥 Customers', desc: 'Customer information' },
                            { id: 'payments', label: '💰 Payments', desc: 'Payment transactions' },
                            { id: 'inventory', label: '📦 Inventory', desc: 'Inventory items & transactions' },
                            { id: 'deliveries', label: '🚚 Deliveries', desc: 'Delivery records' },
                            { id: 'expenses', label: '💸 Expenses', desc: 'Expense records' },
                          ].map(category => (
                            <div key={category.id} className="flex items-start space-x-2 p-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded">
                              <input
                                type="checkbox"
                                id={`backup-${category.id}`}
                                checked={backupCategories.includes(category.id)}
                                onChange={() => toggleBackupCategory(category.id)}
                                className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500 rounded"
                              />
                              <label htmlFor={`backup-${category.id}`} className="flex-1 cursor-pointer">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {category.label}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {category.desc}
                                </div>
                              </label>
                            </div>
                          ))}
                        </div>
                        {backupCategories.length === 0 && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            ⚠️ Please select at least one category
                          </p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="backupFrequency" className="text-sm text-purple-700 dark:text-purple-300">
                          📅 Backup Schedule
                        </Label>
                        <Select value={backupFrequency} onValueChange={setBackupFrequency}>
                          <SelectTrigger id="backupFrequency" className="mt-1 bg-white dark:bg-gray-900">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">📅 Daily - Every day at 11:59 PM (EAT)</SelectItem>
                            <SelectItem value="weekly">📆 Weekly - Every Sunday at 11:59 PM (EAT)</SelectItem>
                            <SelectItem value="monthly">🗓️ Monthly - 1st of each month at 11:59 PM (EAT)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button 
                        onClick={saveEmailBackupSettings}
                        disabled={savingEmailSettings || !backupEmail || backupCategories.length === 0}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {savingEmailSettings ? 'Saving...' : 'Save Automatic Backup Settings'}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Daily Email Backup (New Feature) */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 rounded-lg p-4 sm:p-6 border border-green-200 dark:border-green-800 space-y-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg flex-shrink-0">
                    <Mail className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                      📧 Daily Transaction Backups
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-300 mb-4">
                      Automated daily summaries sent to all administrators at 11:59 PM (EAT)
                    </p>
                    
                    <div className="bg-white dark:bg-gray-900 rounded-lg p-3 sm:p-4 space-y-3 border border-green-200 dark:border-green-800">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-green-700 dark:text-green-300 font-medium block">Status:</span>
                          <div className="mt-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              ● Active
                            </span>
                          </div>
                        </div>
                        <div>
                          <span className="text-green-700 dark:text-green-300 font-medium block">Schedule:</span>
                          <div className="mt-1 text-green-600 dark:text-green-400">
                            11:59 PM daily (EAT)
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-green-200 dark:border-green-800">
                        <p className="text-xs text-green-600 dark:text-green-400 mb-2 font-semibold">
                          Included in daily email:
                        </p>
                        <ul className="text-xs text-green-600 dark:text-green-400 space-y-1 pl-4">
                          <li className="break-words">• Today's orders with customer details and amounts</li>
                          <li className="break-words">• New customers registered today</li>
                          <li className="break-words">• Today's deliveries with status</li>
                          <li className="break-words">• Daily summary statistics</li>
                        </ul>
                      </div>

                      <div className="pt-3 border-t border-green-200 dark:border-green-800">
                        <p className="text-xs text-green-600 dark:text-green-400 mb-3 break-words">
                          <strong>Recipients:</strong> All users with Administrator role and configured email
                        </p>
                        
                        <Button
                          onClick={sendDailyBackupNow}
                          disabled={sendingDailyBackup}
                          size="sm"
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                        >
                          {sendingDailyBackup ? (
                            <>
                              <span className="animate-spin mr-2">⏳</span>
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-2 flex-shrink-0" />
                              <span>Send Daily Backup Now</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 p-3 bg-green-100 dark:bg-green-900 rounded-md">
                      <p className="text-xs text-green-700 dark:text-green-300 break-words">
                        <strong>💡 Tip:</strong> This is separate from the "Download Overall Backup" button above. 
                        Daily backups contain only today's transactions and are automatically sent to administrators' 
                        email for safekeeping.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Backup History */}
              {backupHistory.length > 0 && (
                <div className="bg-muted p-4 rounded-lg space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Recent Backups
                  </h4>
                  <div className="space-y-2">
                    {backupHistory.map((backup, index) => (
                      <div key={index} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                        <div className="flex items-center gap-2">
                          <FileJson className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">{backup.type}</span>
                          <span className="text-muted-foreground">
                            {new Date(backup.created_at).toLocaleString()}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {backup.file_size ? `${(backup.file_size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg space-y-2">
                <h4 className="font-medium flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <Shield className="h-4 w-4" />
                  Backup Best Practices
                </h4>
                <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1 ml-6 list-disc">
                  <li>📧 Set up automatic email backups for daily/weekly protection</li>
                  <li>📥 Download manual backups before major system changes</li>
                  <li>💾 Keep backups in multiple locations (email + external drive + cloud)</li>
                  <li>🔒 Test your backups periodically to ensure they work</li>
                  <li>📅 Full backup monthly, partial backups weekly</li>
                </ul>
              </div>
            </div>

            <div className="border-t pt-6">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Delete Old Orders</AlertTitle>
                <AlertDescription>
                  Clean up old completed orders to improve system performance. Only PAID and DELIVERED orders can be deleted.
                  <br />
                  <strong className="text-destructive">⚠️ Important: Keep orders for at least 7 years for URA tax compliance!</strong>
                </AlertDescription>
              </Alert>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Safety Rules
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                <li>✅ Can delete: PAID + DELIVERED orders only</li>
                <li>❌ Cannot delete: Unpaid, Partial, or Overdue orders</li>
                <li>📊 Dashboard statistics are preserved</li>
                <li>📁 Export orders to CSV before deletion (recommended)</li>
                <li>🏢 Keep records for 7+ years for URA compliance</li>
              </ul>
            </div>

            <Button 
              variant="destructive" 
              onClick={() => setShowDeleteDialog(true)}
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Old Completed Orders
            </Button>
          </div>
        </div>
        )}
      </div>

      {/* Delete Orders Dialog - Admin Only */}
      {isAdmin && (
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Old Orders
            </DialogTitle>
            <DialogDescription>
              Select a year to delete all PAID and DELIVERED orders from that year.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="year">Select Year to Delete</Label>
              <Select 
                value={selectedYear} 
                onValueChange={(year) => {
                  setSelectedYear(year);
                  fetchOrderStats(year);
                }}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Choose year..." />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {orderStats && (
              <Alert>
                <AlertDescription>
                  <strong>{orderStats.count}</strong> completed orders found<br />
                  Total value: <strong>{formatUGX(orderStats.totalAmount)}</strong>
                </AlertDescription>
              </Alert>
            )}

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                This action cannot be undone. Export data first for records!
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteDialog(false);
                setSelectedYear('');
                setOrderStats(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteOrders}
              disabled={!selectedYear || !orderStats || isLoading}
            >
              {isLoading ? 'Deleting...' : 'Delete Orders'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </MainLayout>
  );
}
