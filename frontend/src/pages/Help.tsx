import { MainLayout } from '@/components/layout/MainLayout';
import { HelpCircle, Book, MessageCircle, Phone, Mail, ChevronDown, ChevronUp, Package, Users, DollarSign, Settings, BarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';

interface HelpTopic {
  id: string;
  title: string;
  description: string;
  icon: any;
  content: {
    steps: string[];
    tips?: string[];
  };
}

const helpTopics: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Learn the basics of using the Lush Laundry ERP system',
    icon: Book,
    content: {
      steps: [
        '1. Login with your credentials (email and password)',
        '2. You will see the Dashboard with overview of orders, revenue, and customers',
        '3. Use the sidebar menu to navigate between different sections',
        '4. Your role (Admin/Manager/Desktop Agent) determines what features you can access',
        '5. Check your profile picture in top-right corner to access your account settings',
      ],
      tips: [
        'Admins have full access to all features including user management',
        'Set your session timeout preference in Profile → Account Settings',
        'Enable dark mode by clicking the theme toggle in the sidebar',
      ],
    },
  },
  {
    id: 'creating-orders',
    title: 'Creating Orders',
    description: 'How to create and manage customer orders',
    icon: Package,
    content: {
      steps: [
        '1. Click "New Order" from the sidebar or Orders page',
        '2. Select existing customer or create a new customer',
        '3. Add service items (e.g., Shirt - Iron, Trousers - Wash & Iron)',
        '4. Specify quantity for each item',
        '5. Set pickup and delivery dates',
        '6. Choose payment status (Paid/Pending/Partial)',
        '7. Add any special notes or instructions',
        '8. Click "Create Order" to save',
        '9. Customer receives WhatsApp notification with order details',
      ],
      tips: [
        'You can scan existing customers using phone number search',
        'Service prices are automatically calculated from the Price List',
        'Orders can be edited before they are marked as "Delivered"',
        'Export order receipts as PDF for printing',
      ],
    },
  },
  {
    id: 'price-management',
    title: 'Price Management',
    description: 'Update and manage service prices',
    icon: DollarSign,
    content: {
      steps: [
        '1. Go to "Price List" from the sidebar',
        '2. View all services organized by category',
        '3. Click "Edit Price" button on any service',
        '4. Enter new price and optional notes',
        '5. Click "Update Price" to save',
        '6. New prices apply immediately to all new orders',
      ],
      tips: [
        'Price changes are logged in the Activity section',
        'Old orders keep their original prices',
        'You can add notes explaining price changes',
        'Only Admins and Managers can modify prices',
      ],
    },
  },
  {
    id: 'managing-customers',
    title: 'Managing Customers',
    description: 'Add and manage your customer database',
    icon: Users,
    content: {
      steps: [
        '1. Go to "Customers" from the sidebar',
        '2. Click "Add Customer" button',
        '3. Fill in customer details (name, phone, email, address)',
        '4. Phone number must include country code (+256 for Uganda)',
        '5. Click "Save Customer"',
        '6. View customer order history by clicking on their name',
        '7. Edit customer details or delete if no orders exist',
      ],
      tips: [
        'Search customers by name, phone, or email',
        'Filter customers by status or join date',
        'Customers with pending orders cannot be deleted',
        'Export customer list to Excel',
      ],
    },
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    description: 'Generate and view business reports',
    icon: BarChart,
    content: {
      steps: [
        '1. Go to "Reports" from the sidebar',
        '2. Select report type (Sales, Revenue, Customer Analytics)',
        '3. Choose date range (Today, This Week, This Month, Custom)',
        '4. View charts and statistics',
        '5. Export reports as PDF or Excel',
      ],
      tips: [
        'Dashboard shows real-time overview of key metrics',
        'Financial Dashboard shows revenue trends and analysis',
        'Compare periods to track growth',
      ],
    },
  },
  {
    id: 'user-management',
    title: 'User Management (Admin Only)',
    description: 'Manage staff accounts and permissions',
    icon: Settings,
    content: {
      steps: [
        '1. Go to "User Management" (Admin only)',
        '2. View all active, pending, and suspended users',
        '3. Approve or reject new user registrations',
        '4. Suspend users if needed',
        '5. View user activity logs',
        '6. Manage password reset requests',
      ],
      tips: [
        'ADMIN: Full access to all features',
        'MANAGER: Can manage orders, customers, prices, view reports',
        'DESKTOP_AGENT: Can create orders and manage customers only',
        'Users can request password reset via "Forgot Password"',
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
                  A: Click "Forgot Password" on the login page. Submit a request, and an administrator will set a temporary password for you.
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Q: Can I create my own account?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A: Yes. Use the Create Account page, choose your role, and wait for Systems Administrator approval.
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Q: How do I export reports?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A: Visit Reports, select your date range, and click the export button to download as CSV or PDF.
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Q: Why can't I delete a customer?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A: Customers with existing orders cannot be deleted to maintain order history integrity. You can only delete customers with no orders.
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">Q: How do I upload my profile picture?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  A: Go to Profile → click on the avatar/profile picture → select an image from your computer → click Upload.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
