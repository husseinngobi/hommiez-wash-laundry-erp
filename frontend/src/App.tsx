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
const Campaigns = lazy(() => import("./pages/Campaigns"));
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

/**
 * Skeleton shown while auth pages (Login / CreateAccount / ForgotPassword) load.
 * Matches the gradient background + card layout so there is no jarring flash.
 */
const authFallback = (
  <div className="h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/10 via-background to-secondary/10">
    {/* Logo placeholder */}
    <div className="w-16 h-16 rounded-2xl bg-card border border-border shadow-lg animate-pulse" />
    {/* Brand text skeletons */}
    <div className="space-y-2 text-center">
      <div className="h-5 w-52 rounded bg-muted animate-pulse mx-auto" />
      <div className="h-3 w-36 rounded bg-muted animate-pulse mx-auto" />
    </div>
    {/* Card skeleton */}
    <div className="w-full max-w-md mt-2 px-4">
      <div className="rounded-xl border-2 border-border bg-card shadow-2xl p-6 space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse mx-auto" />
        <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
        <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
        <div className="h-10 w-full rounded-lg bg-muted/60 animate-pulse" />
      </div>
    </div>
  </div>
);

/**
 * Skeleton shown while inner app pages (Dashboard / Orders / etc.) load.
 * Mirrors the app shell so the layout never jumps.
 */
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
            <Routes>
              {/* ── Public / auth routes — clean skeleton, no app shell ── */}
              <Route
                path="/login"
                element={<Suspense fallback={authFallback}><Login /></Suspense>}
              />
              <Route
                path="/create-account"
                element={<Suspense fallback={authFallback}><CreateAccount /></Suspense>}
              />
              <Route
                path="/forgot-password"
                element={<Suspense fallback={authFallback}><ForgotPassword /></Suspense>}
              />

              {/* ── Protected: Change Password ── */}
              <Route
                path="/change-password"
                element={
                  <Suspense fallback={routeFallback}>
                    <ProtectedRoute><ChangePassword /></ProtectedRoute>
                  </Suspense>
                }
              />

              {/* ── Root redirect ── */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              {/* ── Protected: General staff ── */}
              <Route path="/dashboard" element={<Suspense fallback={routeFallback}><ProtectedRoute><Dashboard /></ProtectedRoute></Suspense>} />
              <Route path="/orders" element={<Suspense fallback={routeFallback}><ProtectedRoute><Orders /></ProtectedRoute></Suspense>} />
              <Route path="/orders/new" element={<Suspense fallback={routeFallback}><ProtectedRoute><NewOrder /></ProtectedRoute></Suspense>} />
              <Route path="/customers" element={<Suspense fallback={routeFallback}><ProtectedRoute><Customers /></ProtectedRoute></Suspense>} />
              <Route path="/prices" element={<Suspense fallback={routeFallback}><ProtectedRoute><PriceList /></ProtectedRoute></Suspense>} />
              <Route path="/inventory" element={<Suspense fallback={routeFallback}><ProtectedRoute><Inventory /></ProtectedRoute></Suspense>} />
              <Route path="/deliveries" element={<Suspense fallback={routeFallback}><ProtectedRoute><Deliveries /></ProtectedRoute></Suspense>} />
              <Route path="/messages" element={<Suspense fallback={routeFallback}><ProtectedRoute><Messages /></ProtectedRoute></Suspense>} />
              <Route path="/campaigns" element={<Suspense fallback={routeFallback}><ProtectedRoute><Campaigns /></ProtectedRoute></Suspense>} />
              <Route path="/reports" element={<Suspense fallback={routeFallback}><ProtectedRoute><Reports /></ProtectedRoute></Suspense>} />
              <Route path="/expenses" element={<Suspense fallback={routeFallback}><ProtectedRoute><Expenses /></ProtectedRoute></Suspense>} />
              <Route path="/payments" element={<Suspense fallback={routeFallback}><ProtectedRoute><Payments /></ProtectedRoute></Suspense>} />
              <Route path="/help" element={<Suspense fallback={routeFallback}><ProtectedRoute><Help /></ProtectedRoute></Suspense>} />
              <Route path="/profile" element={<Suspense fallback={routeFallback}><ProtectedRoute><Profile /></ProtectedRoute></Suspense>} />

              {/* ── Protected: Admin only ── */}
              <Route path="/settings" element={<Suspense fallback={routeFallback}><ProtectedRoute requireAdmin><Settings /></ProtectedRoute></Suspense>} />
              <Route path="/user-management" element={<Suspense fallback={routeFallback}><ProtectedRoute requireManager><UserManagement /></ProtectedRoute></Suspense>} />
              <Route path="/password-reset-requests" element={<Suspense fallback={routeFallback}><ProtectedRoute requireManager><PasswordResetRequests /></ProtectedRoute></Suspense>} />
              <Route path="/financial" element={<Suspense fallback={routeFallback}><ProtectedRoute requireAdmin><FinancialDashboard /></ProtectedRoute></Suspense>} />
              <Route path="/accounting" element={<Suspense fallback={routeFallback}><ProtectedRoute requireAdmin><Accounting /></ProtectedRoute></Suspense>} />
              <Route path="/refund-requests" element={<Suspense fallback={routeFallback}><ProtectedRoute requireAdmin><RefundRequests /></ProtectedRoute></Suspense>} />
              <Route path="/payroll" element={<Suspense fallback={routeFallback}><ProtectedRoute requireAdmin><Payroll /></ProtectedRoute></Suspense>} />

              {/* ── Catch-all ── */}
              <Route path="*" element={<Suspense fallback={routeFallback}><NotFound /></Suspense>} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
