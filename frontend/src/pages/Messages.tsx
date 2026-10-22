import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from '@/lib/api';
import { Plus, Send, CheckCircle2, XCircle, Clock, Search, MessageSquare, Smartphone, Tag, Percent, Calendar, Trash2, Sparkles, List, Settings } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import axios from "axios";

interface Message {
  id: number;
  customer_name: string;
  phone_number: string;
  message_text: string;
  message_type: string;
  status: string;
  sent_at: string;
  delivered_at?: string;
  read_at?: string;
  is_bulk?: boolean;
  recipient_count?: number;
  campaign_name?: string;
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

interface Customer {
  id: number;
  name: string;
  phone: string;
  selected?: boolean;
}

const MESSAGE_TEMPLATES = [
  {
    id: 1,
    title: "🎉 Special Discount",
    message: `🎉 SPECIAL OFFER! 🎉

Dear Valued Customer,

Enjoy 20% OFF on all laundry services this week!

✨ Valid until [DATE]
🧺 All items included
📞 Book now: 0754723614

Hommiez Wash Laundry and Dry Cleaners - Your Trusted Partner!

T&Cs apply. Limited time only.`
  },
  {
    id: 2,
    title: "🎊 Holiday Greetings",
    message: `🎊 HAPPY [HOLIDAY NAME]! 🎊

Wishing you and your family joy this festive season!

🎁 SPECIAL GIFT: 15% discount on your next order
📅 Offer valid throughout [MONTH]

Thank you for choosing Hommiez Wash Laundry and Dry Cleaners.

May your celebrations be bright and your clothes always fresh! ✨`
  },
  {
    id: 3,
    title: "⭐ Weekend Special",
    message: `⭐ WEEKEND SPECIAL! ⭐

Beat the Monday rush - Drop off this weekend!

💰 15% OFF all weekend orders
🚀 Express service available
⏰ Saturday & Sunday 8AM - 6PM

Same-day service available!

Hommiez Wash Laundry and Dry Cleaners - Fresher. Faster. Better.`
  },
  {
    id: 4,
    title: "❤️ Customer Appreciation",
    message: `❤️ THANK YOU FOR YOUR LOYALTY! ❤️

Dear Valued Customer,

As our special thank you:

🎁 Get 10% OFF your next 3 orders
✅ Priority pickup & delivery
🌟 VIP customer support

Your trust means everything to us!

Hommiez Wash Laundry and Dry Cleaners - Always at your service. ✨`
  },
  {
    id: 5,
    title: "🆕 New Service Launch",
    message: `🆕 EXCITING NEWS! 🆕

Introducing our NEW Premium Service:

✅ [SERVICE NAME]
🚀 [BENEFIT 1]
💎 [BENEFIT 2]
⭐ [BENEFIT 3]

🎉 LAUNCH OFFER: [DISCOUNT]%
📞 Call us: 0754723614

Experience the Hommiez difference!`
  },
  {
    id: 6,
    title: "👥 Referral Bonus",
    message: `👥 REFER A FRIEND & EARN! 👥

Share the Hommiez experience!

🎁 You get: 20% OFF next order
🎁 Friend gets: 15% OFF first order

How to claim:
1. Share our number: 0754723614
2. Friend mentions your name
3. You both save!

Win-Win! Spread the word! 🌟`
  },
  {
    id: 7,
    title: "🌦️ Seasonal Reminder",
    message: `🌦️ RAINY SEASON SPECIAL! 🌦️

Don't let the weather dirty your plans!

☔ We handle the laundry
🚗 FREE pickup & delivery
⚡ Quick turnaround time
💰 20% OFF this month

Beat the weather blues with Hommiez Wash Laundry and Dry Cleaners!

Book today: 0754723614`
  },
  {
    id: 8,
    title: "🎓 Back to School",
    message: `🎓 BACK TO SCHOOL OFFER! 🎓

Fresh uniforms, fresh start!

📚 School uniforms: 25% OFF
👔 All items included
🚀 Bulk discounts available
📅 Offer valid all [MONTH]

Make mornings easier!

Hommiez Wash Laundry and Dry Cleaners - Clean uniforms, confident students. ✨`
  }
];

export default function Messages() {
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]); // Initialize as empty array
  const [selectedCustomers, setSelectedCustomers] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const [campaignName, setCampaignName] = useState(""); // Track campaign name for bulk sends
  const [sendMethod, setSendMethod] = useState<'whatsapp' | 'sms'>('whatsapp'); // Method selection
  const [activeTab, setActiveTab] = useState("campaigns"); // Changed default to campaigns
  const [stats, setStats] = useState({
    total: 0,
    delivered: 0,
    failed: 0,
    pending: 0,
  });
  const [statsPeriod, setStatsPeriod] = useState('today'); // today, week, month, all

  // Promotional campaigns state
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

  // WhatsApp Automation Settings
  const [whatsappAutoSendReceipt, setWhatsappAutoSendReceipt] = useState(true);
  const [whatsappAutoSendReady, setWhatsappAutoSendReady] = useState(true);
  const [whatsappAutoSendDelivered, setWhatsappAutoSendDelivered] = useState(false);
  const [loadingAutomation, setLoadingAutomation] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      if (!token) return;
      const response = await axios.get(`${API_BASE_URL}/whatsapp/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages(response.data.messages);
      setStats(response.data.stats);
    } catch (error) {
      console.error("Fetch messages error:", error);
    }
  }, [token]);

  const fetchAutomationSettings = useCallback(async () => {
    try {
      if (!token) return;
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

  const fetchCustomers = useCallback(async () => {
    try {
      if (!token) return;
      // Fetch customers who have opted in to SMS/WhatsApp (sms_opt_in = true)
      const response = await axios.get(`${API_BASE_URL}/customers?limit=10000&smsOptIn=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Handle different response structures
      const customerData = Array.isArray(response.data) 
        ? response.data 
        : (response.data.customers || []);
      setCustomers(customerData);
    } catch (error) {
      console.error("Fetch customers error:", error);
      setCustomers([]); // Set empty array on error
    }
  }, [token]);

  useEffect(() => {
    fetchMessages();
    fetchCustomers();
    fetchAutomationSettings();
  }, [fetchMessages, fetchCustomers, fetchAutomationSettings, statsPeriod]); // Re-fetch when period changes

  // Refresh customers when dialog opens
  useEffect(() => {
    if (showBulkDialog) {
      fetchCustomers(); // Reload customers when opening dialog
    }
  }, [showBulkDialog, fetchCustomers]);

  const handleSelectCustomer = (customerId: number) => {
    setSelectedCustomers((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    );
  };

  const handleSelectAll = () => {
    if (selectedCustomers.length === filteredCustomers.length) {
      setSelectedCustomers([]);
    } else {
      setSelectedCustomers(filteredCustomers.map((c) => c.id));
    }
  };

  const handleSelectPage = (startIndex: number, count: number) => {
    const pageCustomers = filteredCustomers.slice(startIndex, startIndex + count);
    const pageIds = pageCustomers.map((c) => c.id);
    setSelectedCustomers((prev) => [...new Set([...prev, ...pageIds])]);
  };

  const handleSendBulk = async () => {
    if (!bulkMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }

    if (selectedCustomers.length === 0) {
      toast.error("Please select at least one customer");
      return;
    }

    setLoading(true);
    try {
      if (!token) return;
      
      const response = await axios.post(
        `${API_BASE_URL}/whatsapp/send-bulk`,
        {
          customer_ids: selectedCustomers,
          message: bulkMessage,
          campaign_name: campaignName || `Campaign ${new Date().toLocaleDateString()}`, // Include campaign name
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`WhatsApp messages sent to ${response.data.sent} customers!`);
      setShowBulkDialog(false);
      setBulkMessage("");
      setCampaignName(""); // Reset campaign name
      setSelectedCustomers([]);
      setSendMethod('whatsapp'); // Reset to default
      fetchMessages();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : (error as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to send messages";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone?.includes(searchTerm)
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
      case "read":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      delivered: "default",
      read: "default",
      sent: "secondary",
      failed: "destructive",
      pending: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status.toUpperCase()}</Badge>;
  };

  // Promotional campaign functions
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

      toast.success(
        `WhatsApp automation ${value ? 'enabled' : 'disabled'} successfully`
      );
    } catch (error) {
      console.error('Failed to update automation settings:', error);
      toast.error('Failed to update automation settings');
    } finally {
      setLoadingAutomation(false);
    }
  };

  const createPromotion = async () => {
    if (!promoName || !promoStartDate || !promoEndDate || !promoMessage) {
      toast.error('Please fill in all required fields');
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

      toast.success('Promotion created successfully');
      setPromoName('');
      setPromoDescription('');
      setPromoDiscount('');
      setPromoStartDate('');
      setPromoEndDate('');
      setPromoMessage('');
      fetchPromotions();
    } catch (error) {
      toast.error('Failed to create promotion');
    } finally {
      setCreatingPromo(false);
    }
  };

  const activatePromotion = async (id: number, promoName: string) => {
    if (!confirm(`Send promotional message to all customers for "${promoName}"?`)) {
      return;
    }

    try {
      const response = await axios.post(
        `${API_BASE_URL}/promotions/${id}/activate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`SMS will be sent to ${response.data.customers_count} customers`);
      fetchPromotions();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to activate promotion';
      toast.error(errorMessage);
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

      toast.success('Promotion deleted');
      fetchPromotions();
    } catch (error) {
      toast.error('Failed to delete promotion');
    }
  };

  const generatePromoMessage = () => {
    const discount = promoDiscount ? `${promoDiscount}% OFF` : 'Special Offer';
    const name = promoName || 'Our Special Event';
    
    const template = `🎉 ${name.toUpperCase()}! 🎉

${discount} on all laundry services!

Valid until: ${promoEndDate ? new Date(promoEndDate).toLocaleDateString('en-GB') : '[End Date]'}

Visit Hommiez Wash Laundry and Dry Cleaners and enjoy this amazing offer!

📍 Location: [Your Address]
📞 Call: [Your Phone]

Don't miss out! ✨`;

    setPromoMessage(template);
  };

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  return (
    <MainLayout title="Messages" subtitle="Send and manage customer communications">
      {/* WhatsApp Automation Settings Card - Accessible to All Users */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>WhatsApp Automation</CardTitle>
              <CardDescription>
                Control when WhatsApp messages are sent automatically
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium leading-none">Order Confirmation</p>
                <p className="text-xs text-muted-foreground">
                  Auto-send when order is created
                </p>
              </div>
              <Switch
                checked={whatsappAutoSendReceipt}
                onCheckedChange={(checked) => handleSaveAutomation('receipt', checked)}
                disabled={loadingAutomation}
              />
            </div>

            <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium leading-none">Order Ready</p>
                <p className="text-xs text-muted-foreground">
                  Auto-send when order is ready
                </p>
              </div>
              <Switch
                checked={whatsappAutoSendReady}
                onCheckedChange={(checked) => handleSaveAutomation('ready', checked)}
                disabled={loadingAutomation}
              />
            </div>

            <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium leading-none">Delivery Confirmation</p>
                <p className="text-xs text-muted-foreground">
                  Auto-send when order delivered
                </p>
              </div>
              <Switch
                checked={whatsappAutoSendDelivered}
                onCheckedChange={(checked) => handleSaveAutomation('delivered', checked)}
                disabled={loadingAutomation}
              />
            </div>
          </div>

          <Alert>
            <MessageSquare className="h-4 w-4" />
            <AlertDescription>
              When automation is OFF, you can still manually send WhatsApp messages from the Orders page. 
              These settings only control automatic sending.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto">
          <TabsTrigger value="campaigns" className="gap-1 sm:gap-2 text-xs sm:text-sm">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="hidden min-[400px]:inline">Promotional</span>
            <span className="min-[400px]:hidden">Promo</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1 sm:gap-2 text-xs sm:text-sm">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="truncate">Message History</span>
          </TabsTrigger>
        </TabsList>

        {/* Promotional Campaigns Tab (WhatsApp + SMS) */}
        <TabsContent value="campaigns" className="space-y-6">
          {/* Period Selector */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                <Label className="text-sm font-medium shrink-0">Stats Period:</Label>
                <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                  <Button
                    variant={statsPeriod === 'today' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatsPeriod('today')}
                    className="flex-1 sm:flex-initial"
                  >
                    Today
                  </Button>
                  <Button
                    variant={statsPeriod === 'week' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatsPeriod('week')}
                    className="flex-1 sm:flex-initial"
                  >
                    This Week
                  </Button>
                  <Button
                    variant={statsPeriod === 'month' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatsPeriod('month')}
                    className="flex-1 sm:flex-initial"
                  >
                    This Month
                  </Button>
                  <Button
                    variant={statsPeriod === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatsPeriod('all')}
                    className="flex-1 sm:flex-initial"
                  >
                    All Time
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground capitalize">{statsPeriod === 'all' ? 'All time' : statsPeriod}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.delivered}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0}% success rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

          {/* Send Bulk Messages (WhatsApp or SMS) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send Bulk Promotional Message
              </CardTitle>
              <CardDescription>Send promotional messages to customers via WhatsApp or SMS</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={() => setShowBulkDialog(true)} className="w-full">
                <Send className="mr-2 h-4 w-4" />
                Send Bulk Message
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Choose WhatsApp or SMS delivery in the next step
              </p>
            </CardContent>
          </Card>

          {/* Scheduled Campaigns */}
          {/* Scheduled Campaigns */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Create Scheduled Campaign
              </CardTitle>
              <CardDescription>Create promotional message templates - select customers when ready to send</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="promoName">Campaign Name *</Label>
                  <Input
                    id="promoName"
                    placeholder="e.g., Summer Sale 2024"
                    value={promoName}
                    onChange={(e) => setPromoName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="promoDiscount" className="flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Discount Percentage
                  </Label>
                  <Input
                    id="promoDiscount"
                    type="number"
                    placeholder="e.g., 20"
                    value={promoDiscount}
                    onChange={(e) => setPromoDiscount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="promoDescription">Description (Optional)</Label>
                <Input
                  id="promoDescription"
                  placeholder="Brief description of the campaign"
                  value={promoDescription}
                  onChange={(e) => setPromoDescription(e.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="promoStartDate" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Start Date *
                  </Label>
                  <Input
                    id="promoStartDate"
                    type="date"
                    value={promoStartDate}
                    onChange={(e) => setPromoStartDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="promoStartTime">Start Time</Label>
                  <Input
                    id="promoStartTime"
                    type="time"
                    value={promoStartTime}
                    onChange={(e) => setPromoStartTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="promoEndDate">End Date *</Label>
                  <Input
                    id="promoEndDate"
                    type="date"
                    value={promoEndDate}
                    onChange={(e) => setPromoEndDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="promoEndTime">End Time</Label>
                  <Input
                    id="promoEndTime"
                    type="time"
                    value={promoEndTime}
                    onChange={(e) => setPromoEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="promoMessage">SMS Message *</Label>
                <Textarea
                  id="promoMessage"
                  placeholder="Enter the SMS message to send to customers"
                  value={promoMessage}
                  onChange={(e) => setPromoMessage(e.target.value)}
                  rows={6}
                />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{promoMessage.length} characters</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generatePromoMessage}
                    disabled={!promoName && !promoDiscount}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Template
                  </Button>
                </div>
              </div>

              <Button onClick={createPromotion} disabled={creatingPromo} className="w-full">
                {creatingPromo ? 'Creating...' : 'Create Campaign'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <List className="h-5 w-5" />
                Existing Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPromos ? (
                <div className="text-center py-8 text-muted-foreground">Loading campaigns...</div>
              ) : promotions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No campaigns yet</div>
              ) : (
                <div className="space-y-4">
                  {promotions.map((promo) => (
                    <Card key={promo.id} className="border-l-4 border-l-primary">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{promo.name}</CardTitle>
                            <div className="flex gap-2 mt-2">
                              <Badge variant={
                                promo.status === 'ACTIVE' ? 'default' :
                                promo.status === 'EXPIRED' ? 'secondary' : 'outline'
                              }>
                                {promo.status}
                              </Badge>
                              {promo.discount_percentage && (
                                <Badge variant="outline">{promo.discount_percentage}% OFF</Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deletePromotion(promo.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <CardDescription className="mt-2">
                          {new Date(promo.start_date).toLocaleString('en-GB')} → {new Date(promo.end_date).toLocaleString('en-GB')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-4">
                          {promo.message}
                        </p>
                        {promo.sms_sent ? (
                          <div className="flex items-center gap-2 text-sm text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Sent to {promo.sms_sent_at ? new Date(promo.sms_sent_at).toLocaleString('en-GB') : 'N/A'}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => {
                              setBulkMessage(promo.message);
                              setShowBulkDialog(true);
                            }}
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Send to Customers
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Message History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Message History</CardTitle>
              <CardDescription>Order notifications (Created/Ready) and bulk promotional campaign summaries</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Recipients</TableHead>
                      <TableHead className="whitespace-nowrap">Message</TableHead>
                      <TableHead className="whitespace-nowrap">Type</TableHead>
                      <TableHead className="whitespace-nowrap">Sent At</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {messages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No messages sent yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    messages.map((msg) => (
                      <TableRow key={msg.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(msg.status)}
                            {getStatusBadge(msg.status)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {msg.is_bulk ? (
                            <div className="space-y-1">
                              <div className="font-medium">{msg.recipient_count} customers</div>
                              {msg.campaign_name && (
                                <div className="text-sm text-muted-foreground">{msg.campaign_name}</div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="font-medium">{msg.customer_name}</div>
                              <div className="text-sm text-muted-foreground">{msg.phone_number}</div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-md">
                          {msg.is_bulk ? (
                            <div className="space-y-1">
                              <Badge variant="secondary" className="mb-1">Bulk Message</Badge>
                              <p className="text-sm text-muted-foreground truncate">
                                {msg.message_text.substring(0, 50)}...
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm">{msg.message_text}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{msg.message_type}</Badge>
                        </TableCell>
                        <TableCell>{new Date(msg.sent_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bulk Send Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Send Bulk Promotional Message</DialogTitle>
            <DialogDescription>
              Select customers and send promotional messages via WhatsApp or SMS
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Campaign Name */}
            <div>
              <label className="text-sm font-medium mb-2 block">📌 Campaign Name (Optional)</label>
              <Input
                placeholder="e.g., Weekend Special, New Year Promo"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="mb-2"
              />
              <p className="text-xs text-muted-foreground">
                Helps identify this campaign in message history. Auto-generated if not specified.
              </p>
            </div>

            {/* Message Templates */}
            <div>
              <label className="text-sm font-medium mb-2 block">📝 Promotional Templates</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {MESSAGE_TEMPLATES.map((template) => (
                  <Button
                    key={template.id}
                    variant="outline"
                    size="sm"
                    className="h-auto py-2 text-xs"
                    onClick={() => setBulkMessage(template.message)}
                  >
                    {template.title}
                  </Button>
                ))}
              </div>
            </div>

            {/* Message Input */}
            <div>
              <label className="text-sm font-medium">Message</label>
              <Textarea
                placeholder="Enter your promotional message here or select a template above..."
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
                rows={6}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {bulkMessage.length} characters • Click a template above to auto-fill
              </p>
            </div>

            {/* Quick Selection Buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedCustomers.length === filteredCustomers.length ? "Deselect All" : `Select All (${filteredCustomers.length})`}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleSelectPage(0, 10)}>
                First 10
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleSelectPage(0, 50)}>
                First 50
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleSelectPage(0, 100)}>
                First 100
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleSelectPage(0, 200)}>
                First 200
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedCustomers([])}>
                Clear Selection
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              {selectedCustomers.length} of {filteredCustomers.length} customers selected
            </p>

            {/* Customer Search */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Customer List */}
            <div className="border rounded-md max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedCustomers.length === filteredCustomers.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedCustomers.includes(customer.id)}
                          onCheckedChange={() => handleSelectCustomer(customer.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>{customer.phone}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Send Method Selection & Button */}
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Select Sending Method:</Label>
                <RadioGroup value={sendMethod} onValueChange={(value: 'whatsapp' | 'sms') => setSendMethod(value)} className="flex flex-col sm:flex-row gap-3">
                  <div className="flex items-center space-x-2 flex-1 rounded-lg border-2 p-4 cursor-pointer hover:bg-accent" 
                       style={{ borderColor: sendMethod === 'whatsapp' ? 'hsl(var(--primary))' : 'transparent' }}
                       onClick={() => setSendMethod('whatsapp')}>
                    <RadioGroupItem value="whatsapp" id="method-whatsapp" />
                    <Label htmlFor="method-whatsapp" className="flex items-center gap-2 cursor-pointer flex-1">
                      <MessageSquare className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="font-medium">WhatsApp</div>
                        <div className="text-xs text-muted-foreground">Send via WhatsApp Business</div>
                      </div>
                    </Label>
                  </div>
                  {/* SMS is not wired to a provider yet — offering it would only fail */}
                  <div className="flex items-center space-x-2 flex-1 rounded-lg border-2 border-transparent p-4 opacity-50 cursor-not-allowed">
                    <RadioGroupItem value="sms" id="method-sms" disabled />
                    <Label htmlFor="method-sms" className="flex items-center gap-2 flex-1">
                      <Smartphone className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-medium">SMS</div>
                        <div className="text-xs text-muted-foreground">Not available yet</div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <Button variant="outline" onClick={() => setShowBulkDialog(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button onClick={handleSendBulk} disabled={loading} className="gap-2 w-full sm:w-auto">
                  <Send className="h-4 w-4" />
                  {loading ? "Sending..." : `Send to ${selectedCustomers.length} Customer${selectedCustomers.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
