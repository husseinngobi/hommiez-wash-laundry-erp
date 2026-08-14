import { MainLayout } from '@/components/layout/MainLayout';
import { HelpCircle, Book, MessageCircle, Phone, Mail, ChevronDown, ChevronUp, Package, Users, DollarSign, Settings, BarChart, Building2, Warehouse, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface HelpTopic {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  content: {
    steps: string[];
    tips?: string[];
  };
}

const helpTopics: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Log in, navigate, and understand what each role can do',
    icon: Book,
    content: {
      steps: [
        '1. Sign in with your email and password',
        '2. The Dashboard opens first and shows the current operational summary',
        '3. Use the sidebar to move between orders, customers, payments, expenses, reports, and settings',
        '4. Admin, Manager, and Desktop Agent permissions control what each user can open and edit',
        '5. Use the profile menu for account settings, session timeout, and logout',
      ],
      tips: [
        'The app remembers the page you were on when a session is refreshed or re-authenticated',
        'Your session timeout preference is stored per user account',
        'Admins have access to finance, accounting, refunds, user management, and system settings',
      ],
    },
  },
  {
    id: 'creating-orders',
    title: 'Creating Orders',
    description: 'Create orders, add items, and record notes correctly',
    icon: Package,
    content: {
      steps: [
        '1. Open New Order from the sidebar or Orders page',
        '2. Select an existing customer or create a new one',
        '3. Add service items and quantities from the price list',
        '4. Enter pickup and delivery dates',
        '5. Set payment status as Paid, Partial, or Unpaid',
        '6. Add notes for the order or for individual items when needed',
        '7. Tick “Record for a past date” if you are entering a historical order, then pick the original order date',
        '8. Save the order and review the generated order record',
      ],
      tips: [
        'Item notes are available in the order details dialog through View note',
        'Prices are pulled from the current Price List automatically',
        'Past-date orders sit in the Orders table by their original date, not the day you typed them in',
        'Desktop agents always book against their assigned branch. Admins and managers choose the branch.',
        'Receipts and order summaries can be exported or printed when needed',
      ],
    },
  },
  {
    id: 'historical-orders',
    title: 'Past-date orders and payments',
    description: 'Enter old orders so they sit in the correct date and payment period',
    icon: Calendar,
    content: {
      steps: [
        '1. On New Order, tick Record for a past date and pick the original order date (today or earlier)',
        '2. Save the order. It appears in the Orders table by that order date, not the day you typed it',
        '3. Use the Past-date entries filter on Orders to find only historically entered records',
        '4. When adding a payment on such an order, pick the Payment Date so Payments and accounting use the real receipt day',
        '5. If the order was paid when it was originally taken, that first payment uses the same past date',
      ],
      tips: [
        'You cannot pick a future date',
        'The Dashboard still shows newly entered work in Recent activity, which is expected',
        'A Historical badge on the order date column marks backdated entries',
      ],
    },
  },
  {
    id: 'payments',
    title: 'Payments',
    description: 'View payment history, filters, and payment statistics',
    icon: DollarSign,
    content: {
      steps: [
        '1. Open Payments from the sidebar',
        '2. Review all payment records, including partial payments and refunds where allowed',
        '3. Use the period filter to narrow results by Today, Week, Month, Year, or All Time',
        '4. Open a payment to review details or receipt information',
        '5. When adding a payment on an order, you can pick the payment date so it lands in the correct period',
        '6. Use the payment actions only when your role is allowed to do so',
      ],
      tips: [
        'The default payment view is All Time so the full ledger is visible first',
        'Desktop agents only see payments that belong to orders at their assigned branch',
        'Filters only narrow the data; they do not change the stored payment history',
        'Payment statistics are calculated from the same backend data as the payment list',
        'Historical orders should use the date the money was actually received',
      ],
    },
  },
  {
    id: 'price-management',
    title: 'Price Management',
    description: 'Update service prices from the Price List',
    icon: Users,
    content: {
      steps: [
        '1. Open Price List from the sidebar',
        '2. Review services by category',
        '3. Click Edit Price on the service you want to update',
        '4. Enter the new amount and any note if needed',
        '5. Save the change so new orders use the new price',
      ],
      tips: [
        'Existing orders keep the price they were created with',
        'Only authorized users can update price data',
        'Use notes to explain price changes when the business needs a record',
      ],
    },
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    description: 'Use dashboard, financial, and accounting reports correctly',
    icon: BarChart,
    content: {
      steps: [
        '1. Use the Dashboard for the main operational summary',
        '2. Use Financial Dashboard for revenue and business performance views',
        '3. Use Accounting for income statement, balance sheet, cash flow, and trial balance reports',
        '4. Choose the timeframe, and for admins, choose All Branches or a specific branch',
        '5. Staff performance lists only people who have created orders — deleted or unused accounts stay off the table',
        '6. Export the selected reports to PDF from the Accounting page',
      ],
      tips: [
        'Desktop agents see performance for their assigned branch',
        'Accounting still totals the whole business for administrators',
        'Accounting reports now support the selected timeframe and year where applicable',
        'The export PDF button uses the same period as the screen you are viewing',
      ],
    },
  },
  {
    id: 'branches',
    title: 'Branches',
    description: 'How orders, expenses, inventory, and payroll follow each branch',
    icon: Building2,
    content: {
      steps: [
        '1. Add and edit branches in Settings. New branches are available immediately.',
        '2. Assign each Desktop Agent to a branch in User Management',
        '3. Desktop agents record orders, expenses, and inventory against their assigned branch automatically',
        '4. Admins and managers choose the branch when recording an expense, adding inventory, or creating an order',
        '5. Customers stay shared across all branches',
        '6. Deliveries follow the order’s branch, because the order is already assigned',
      ],
      tips: [
        'Payment modes can be set per branch in Settings',
        'Administrators can view all branches together, or pick one branch on Dashboard, Orders, Payments, Expenses, and Accounting',
        'Desktop agents only see their assigned branch: dashboard (including recent orders), orders, payments tied to those orders, expenses, inventory, and reports',
        'Customers stay shared. Deliveries follow the order’s branch.',
      ],
    },
  },
  {
    id: 'expenses',
    title: 'Expenses',
    description: 'Record and approve expenses by branch',
    icon: DollarSign,
    content: {
      steps: [
        '1. Open Expenses from the sidebar',
        '2. Click Record Expense and fill date, category, amount, and payment method',
        '3. Admins and managers pick the branch. Desktop agents are saved to their own branch.',
        '4. Submit for approval. Admins approve or reject from the list.',
        '5. Filter by month, category, status, or branch to review the ledger',
      ],
      tips: [
        'Approved expenses feed accounting for the whole business',
        'Click a row to see receipt number, method, branch, and who recorded it',
      ],
    },
  },
  {
    id: 'inventory',
    title: 'Inventory',
    description: 'Keep stock per branch',
    icon: Warehouse,
    content: {
      steps: [
        '1. Open Inventory from the sidebar',
        '2. Admins can filter All Branches or one location',
        '3. Add items against the correct branch so stock is not mixed',
        '4. Restock and usage apply to that branch’s quantity',
        '5. Desktop agents only see and update stock for their assigned branch',
      ],
      tips: [
        'The same item name can exist at more than one branch as separate stock',
        'Low-stock alerts are based on the items visible for your branch',
      ],
    },
  },
  {
    id: 'payroll',
    title: 'Payroll',
    description: 'Assign workers to branches and pay them by location',
    icon: Users,
    content: {
      steps: [
        '1. Open Payroll (administrators)',
        '2. When adding an employee, choose their branch',
        '3. Filter the employee list and salary history by branch',
        '4. Process salary payments as usual — they stay tied to that worker’s branch',
      ],
      tips: [
        'Use branch filter to review one location’s wage bill',
        'Existing employees were assigned to the main branch and can be edited',
      ],
    },
  },
  {
    id: 'user-management',
    title: 'User Management',
    description: 'Manage staff accounts, roles, and approval flow',
    icon: Settings,
    content: {
      steps: [
        '1. Open User Management from the sidebar if your role allows it',
        '2. Review active, pending, and suspended users',
        '3. Approve or reject new registrations when needed',
        '4. Reset or suspend users according to company policy',
        '5. Use password reset requests to help staff regain access',
      ],
      tips: [
        'ADMIN has the broadest access, including system and accounting areas',
        'MANAGER access is broader than Desktop Agent but still restricted from admin-only areas',
        'Desktop Agent access is focused on day-to-day operations',
      ],
    },
  },
  {
    id: 'session-and-access',
    title: 'Session and Access',
    description: 'What happens on refresh, logout, and session expiry',
    icon: Settings,
    content: {
      steps: [
        '1. If your session is still valid, refreshing the page keeps you on the same route',
        '2. If the session expires, you are redirected to Login',
        '3. After signing in again, the app returns you to the page you were using',
        '4. Use Logout when you want to end the session manually',
      ],
      tips: [
        'This behavior is handled by the auth context and the global axios interceptors',
        'If you land on Login unexpectedly, it usually means the token expired or the backend returned 401',
      ],
    },
  },
];

export default function Help() {
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  const toggleTopic = (topicId: string) => {
    setExpandedTopic(expandedTopic === topicId ? null : topicId);
  };

  return (
    <MainLayout title="Help & Support" subtitle="Get help using the ERP system">
      <div className="max-w-4xl space-y-6">
        {/* Quick Help Topics */}
        <div className="space-y-3">
          {helpTopics.map((topic) => (
            <Card
              key={topic.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => toggleTopic(topic.id)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <topic.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{topic.title}</CardTitle>
                      <CardDescription className="text-sm">{topic.description}</CardDescription>
                    </div>
                  </div>
                  {expandedTopic === topic.id ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              {expandedTopic === topic.id && (
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    {/* Steps */}
                    <div>
                      <h4 className="font-semibold text-sm mb-2">📋 Step-by-Step Guide:</h4>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {topic.content.steps.map((step, index) => (
                          <li key={index} className="pl-4">{step}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Tips */}
                    {topic.content.tips && topic.content.tips.length > 0 && (
                      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-900">
                        <h4 className="font-semibold text-sm mb-2 text-blue-900 dark:text-blue-100">💡 Pro Tips:</h4>
                        <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
                          {topic.content.tips.map((tip, index) => (
                            <li key={index} className="pl-4">• {tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {/* Contact Support */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-primary" />
              <CardTitle>Contact Support</CardTitle>
            </div>
            <CardDescription>
              Need technical assistance? Contact the developer for system support.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                <strong>Developer:</strong> Ngobi Hussein
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Available:</strong> Monday - Saturday, 8:00 AM - 9:00 PM (EAT)
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="gap-2" asChild>
                <a href="tel:+256754723614">
                  <Phone className="h-4 w-4" />
                  +256 754 723 614
                </a>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <a href="mailto:husseinibram555@gmail.com">
                  <Mail className="h-4 w-4" />
                  husseinibram555@gmail.com
                </a>
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-4 space-y-1">
              <p>📞 Call for urgent technical issues</p>
              <p>📧 Email for feature requests or detailed questions</p>
              <p>💬 WhatsApp: Same number as phone</p>
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <HelpCircle className="h-5 w-5 text-primary" />
              <CardTitle>Frequently Asked Questions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <p className="font-medium text-sm">Q: How do I reset my password?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A: Click "Forgot Password" on the login page. Submit a request, and an administrator will handle the reset flow for you.
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Q: Can I create my own account?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A: Yes. Use the Create Account page, then wait for approval before the account becomes active.
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Q: How do I export reports?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A: Use Accounting, choose the timeframe, select the reports you want, and click Export PDF.
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Q: Why can't I delete a customer?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A: Customers with existing orders or payment history are protected so the business record stays intact.
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Q: How do I upload my profile picture?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A: Open Profile, click the avatar area, choose an image, and upload it.
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Q: Why did a refreshed page send me to Login?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A: That usually means the session expired or the server returned 401. If the session is valid, the app keeps you on the same page.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
