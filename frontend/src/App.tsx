import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/layout/Sidebar";
import ScrollToTop from "./components/ScrollToTop";

const Login = lazy(() => import("./pages/Login"));
const CreateAccount = lazy(() => import("./pages/CreateAccount"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Orders = lazy(() => import("./pages/Orders"));
const NewOrder = lazy(() => import("./pages/NewOrder"));
const Customers = lazy(() => import("./pages/Customers"));
const Messages = lazy(() => import("./pages/Messages"));
const PriceList = lazy(() => import("./pages/PriceList"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Deliveries = lazy(() => import("./pages/Deliveries"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const Help = lazy(() => import("./pages/Help"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const PasswordResetRequests = lazy(() => import("./pages/PasswordResetRequests"));
const Expenses = lazy(() => import("./pages/Expenses"));
const FinancialDashboard = lazy(() => import("./pages/FinancialDashboard"));
const Accounting = lazy(() => import("./pages/Accounting"));
const Payroll = lazy(() => import("./pages/Payroll"));
const Payments = lazy(() => import("./pages/Payments"));
const RefundRequests = lazy(() => import("./pages/RefundRequests"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const routeFallback = (
  <div className="min-h-screen bg-background">
    <Sidebar isOpen={true} hasInteracted={false} />
    <div className="pl-64">
      <header className="sticky top-0 z-30 h-14 md:h-16 bg-card border-b border-border flex items-center justify-between px-3 md:px-6 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 overflow-hidden">
          <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
          <div className="min-w-0 space-y-2">
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="hidden sm:block h-3 w-48 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="hidden sm:block h-9 w-72 rounded-lg bg-muted animate-pulse" />
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        </div>
      </header>
      <main className="p-3 md:p-6">
        <div className="space-y-4">
          <div className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="h-40 rounded-xl bg-card border border-border animate-pulse" />
            <div className="h-40 rounded-xl bg-card border border-border animate-pulse" />
            <div className="h-40 rounded-xl bg-card border border-border animate-pulse" />
          </div>
          <div className="h-[420px] rounded-xl bg-card border border-border animate-pulse" />
        </div>
      </main>
    </div>
  </div>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <AuthProvider>
            <Suspense fallback={routeFallback}>
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/create-account" element={<CreateAccount />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                
                {/* Protected Route - Change Password (requires authentication) */}
                <Route 
                  path="/change-password" 
                  element={
                    <ProtectedRoute>
                      <ChangePassword />
                    </ProtectedRoute>
                  } 
                />
                
                {/* Protected Routes - Admin Only */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/customers"
                  element={
                    <ProtectedRoute>
                      <Customers />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/prices"
                  element={
                    <ProtectedRoute>
                      <PriceList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/inventory"
                  element={
                    <ProtectedRoute requireManager>
                      <Inventory />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/deliveries"
                  element={
                    <ProtectedRoute>
                      <Deliveries />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/messages"
                  element={
                    <ProtectedRoute>
                      <Messages />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute>
                      <Reports />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/user-management"
                  element={
                    <ProtectedRoute requireAdmin>
                      <UserManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/password-reset-requests"
                  element={
                    <ProtectedRoute requireAdmin>
                      <PasswordResetRequests />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/financial"
                  element={
                    <ProtectedRoute requireAdmin>
                      <FinancialDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/accounting"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Accounting />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/payments"
                  element={
                    <ProtectedRoute>
                      <Payments />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/refund-requests"
                  element={
                    <ProtectedRoute requireAdmin>
                      <RefundRequests />
                    </ProtectedRoute>
                  }
                />
                
                {/* Protected Routes - Both Admin and Cashier */}
                <Route
                  path="/orders"
                  element={
                    <ProtectedRoute>
                      <Orders />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/orders/new"
                  element={
                    <ProtectedRoute>
                      <NewOrder />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/expenses"
                  element={
                    <ProtectedRoute>
                      <Expenses />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/help"
                  element={
                    <ProtectedRoute>
                      <Help />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/payroll"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Payroll />
                    </ProtectedRoute>
                  }
                />
                
                {/* Catch-all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
