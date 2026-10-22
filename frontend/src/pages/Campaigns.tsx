import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  MessageSquare,
  Search,
  Users,
  Send,
  CheckSquare,
  Square,
  Phone,
  ExternalLink,
  AlertCircle,
  Megaphone,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';

interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  total_orders?: number;
  sms_opt_in: boolean;
}

const MESSAGE_TEMPLATES = [
  {
    id: 'promo',
    label: '🎉 Promotion / Offer',
    body: `Hello {name},\n\nWe have an exciting offer at {business}!\n\n✨ {offer}\n\nValid until {date}. Don't miss out — visit us or call us today!\n\n📞 {phone}`,
  },
  {
    id: 'reminder',
    label: '🔔 General Reminder',
    body: `Hello {name},\n\nThis is a friendly reminder from {business}.\n\n{message}\n\nThank you for choosing us!\n📞 {phone}`,
  },
  {
    id: 'holiday',
    label: '🎊 Seasonal Greeting',
    body: `Hello {name},\n\n{business} wishes you and your family a wonderful {occasion}! 🎊\n\nWe remain open to serve you. Visit us or call:\n📞 {phone}\n\nThank you for your continued support!`,
  },
  {
    id: 'reactivation',
    label: '👋 Re-engagement (Lapsed Customer)',
    body: `Hello {name},\n\nWe miss you at {business}! 👋\n\nIt's been a while since your last visit. We'd love to have you back.\n\nBring this message for a special offer on your next order!\n\n📞 {phone}\n\nSee you soon!`,
  },
  {
    id: 'custom',
    label: '✏️ Custom Message',
    body: '',
  },
];

function buildWhatsAppLink(phone: string, message: string): string {
  // Ensure phone has country code; strip non-numeric except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleaned}?text=${encoded}`;
}

function personaliseMessage(template: string, customer: Customer, businessName: string, businessPhone: string): string {
  return template
    .replace(/{name}/g, customer.name)
    .replace(/{business}/g, businessName)
    .replace(/{phone}/g, businessPhone);
}

export default function Campaigns() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Message composer
  const [templateId, setTemplateId] = useState('custom');
  const [messageBody, setMessageBody] = useState('');

  // Business info for personalisation
  const [businessName, setBusinessName] = useState('Lush Dry Cleaners & Laundromat');
  const [businessPhone, setBusinessPhone] = useState('');

  // Launch dialog
  const [showLaunchDialog, setShowLaunchDialog] = useState(false);
  const [launchIndex, setLaunchIndex] = useState(0);
  const [launched, setLaunched] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchCustomers();
    fetchBusinessInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE_URL}/customers`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 500 },
      });
      setCustomers((res.data.customers || res.data || []).filter((c: Customer) => !!c.phone));
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load customers' });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  const fetchBusinessInfo = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/settings/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const s = res.data?.settings || res.data || {};
      if (s.business_name) setBusinessName(s.business_name);
      if (s.business_phone) setBusinessPhone(s.business_phone);
    } catch { /* non-critical */ }
  };

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredCustomers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCustomers.map((c) => c.id)));
    }
  };

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const tpl = MESSAGE_TEMPLATES.find((t) => t.id === id);
    if (tpl && id !== 'custom') setMessageBody(tpl.body);
  };

  const selectedCustomers = filteredCustomers.filter((c) => selectedIds.has(c.id));

  const startCampaign = () => {
    if (!messageBody.trim()) {
      toast({ variant: 'destructive', title: 'Message required', description: 'Write your campaign message first.' });
      return;
    }
    if (selectedCustomers.length === 0) {
      toast({ variant: 'destructive', title: 'No recipients', description: 'Select at least one customer.' });
      return;
    }
    setLaunchIndex(0);
    setLaunched(new Set());
    setShowLaunchDialog(true);
  };

  const openWhatsApp = (customer: Customer) => {
    const personalised = personaliseMessage(messageBody, customer, businessName, businessPhone);
    const url = buildWhatsAppLink(customer.phone, personalised);
    window.open(url, '_blank');
    setLaunched((prev) => new Set([...prev, customer.id]));
  };

  const openNext = () => {
    const next = launchIndex + 1;
    if (next < selectedCustomers.length) {
      setLaunchIndex(next);
    } else {
      setShowLaunchDialog(false);
      toast({ title: 'Campaign sent!', description: `Messages opened for ${launched.size} customer(s).` });
    }
  };

  return (
    <MainLayout title="Campaigns" subtitle="Send messages to your customers">

      {/* Info banner */}
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
        <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <p className="font-medium">One-on-one WhatsApp messaging</p>
          <p className="text-xs mt-0.5 text-blue-600 dark:text-blue-400">
            Select customers, compose your message, then open WhatsApp for each one individually. 
            Bulk API broadcasting will be available when a WhatsApp Business API is connected.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT: Customer selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5" />
              Select Recipients
              {selectedIds.size > 0 && (
                <Badge className="ml-auto">{selectedIds.size} selected</Badge>
              )}
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Select all row */}
            <div
              className="flex items-center gap-3 px-4 py-2 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={toggleAll}
            >
              {selectedIds.size === filteredCustomers.length && filteredCustomers.length > 0 ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {selectedIds.size === filteredCustomers.length && filteredCustomers.length > 0
                  ? `Deselect all (${filteredCustomers.length})`
                  : `Select all (${filteredCustomers.length})`}
              </span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading customers…</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No customers found</div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
                {filteredCustomers.map((customer) => {
                  const isSelected = selectedIds.has(customer.id);
                  return (
                    <div
                      key={customer.id}
                      className={[
                        'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                      ].join(' ')}
                      onClick={() => toggleSelect(customer.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(customer.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{customer.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </p>
                      </div>
                      {customer.total_orders != null && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {customer.total_orders} order{customer.total_orders !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Message composer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-5 w-5" />
              Compose Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={handleTemplateChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESSAGE_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                rows={10}
                placeholder="Type your message here…&#10;&#10;Use {name} for customer's name, {business} for your business name, {phone} for your phone number."
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                className="font-mono text-sm resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Variables: <code className="bg-muted px-1 rounded">{'{name}'}</code>{' '}
                <code className="bg-muted px-1 rounded">{'{business}'}</code>{' '}
                <code className="bg-muted px-1 rounded">{'{phone}'}</code>
              </p>
            </div>

            {/* Preview */}
            {messageBody && selectedCustomers.length > 0 && (
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-3 space-y-1">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">Preview (for {selectedCustomers[0].name})</p>
                <p className="text-xs text-green-800 dark:text-green-300 whitespace-pre-wrap font-mono">
                  {personaliseMessage(messageBody, selectedCustomers[0], businessName, businessPhone)}
                </p>
              </div>
            )}

            <Button
              className="w-full gap-2"
              onClick={startCampaign}
              disabled={!messageBody.trim() || selectedIds.size === 0}
            >
              <Megaphone className="h-4 w-4" />
              Send to {selectedIds.size} Customer{selectedIds.size !== 1 ? 's' : ''}
            </Button>

            {selectedIds.size === 0 && (
              <p className="text-xs text-center text-muted-foreground">Select customers on the left to enable sending</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Launch dialog: open WhatsApp one at a time */}
      <Dialog open={showLaunchDialog} onOpenChange={setShowLaunchDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              Send Campaign
            </DialogTitle>
            <DialogDescription>
              Open WhatsApp for each customer one by one. The message is pre-filled for each.
            </DialogDescription>
          </DialogHeader>

          {/* Progress */}
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{launched.size} / {selectedCustomers.length} sent</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${(launched.size / selectedCustomers.length) * 100}%` }}
              />
            </div>

            {/* Current customer card */}
            {launchIndex < selectedCustomers.length && (() => {
              const current = selectedCustomers[launchIndex];
              const isSent = launched.has(current.id);
              return (
                <div className="rounded-lg border-2 border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="font-medium">{current.name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {current.phone}
                      </p>
                    </div>
                    {isSent && <Badge variant="outline" className="text-green-600 border-green-400">Sent ✓</Badge>}
                  </div>
                  <Button
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => openWhatsApp(current)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open WhatsApp for {current.name}
                  </Button>
                </div>
              );
            })()}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowLaunchDialog(false)} className="w-full sm:w-auto">
              Close
            </Button>
            {launchIndex < selectedCustomers.length && (
              <Button onClick={openNext} className="w-full sm:w-auto gap-2">
                <Send className="h-4 w-4" />
                {launchIndex + 1 < selectedCustomers.length ? 'Next Customer →' : 'Finish'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
