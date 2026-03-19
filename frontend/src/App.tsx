import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Login from "./pages/Login";
import CreateAccount from "./pages/CreateAccount";
import ForgotPassword from "./pages/ForgotPassword";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import NewOrder from "./pages/NewOrder";
import Customers from "./pages/Customers";
import Messages from "./pages/Messages";
import PriceList from "./pages/PriceList";
import Inventory from "./pages/Inventory";
import Deliveries from "./pages/Deliveries";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Help from "./pages/Help";
import UserManagement from "./pages/UserManagement";
import PasswordResetRequests from "./pages/PasswordResetRequests";
import Expenses from "./pages/Expenses";
import FinancialDashboard from "./pages/FinancialDashboard";
import Accounting from "./pages/Accounting";
import Payroll from "./pages/Payroll";
import Payments from "./pages/Payments";
import RefundRequests from "./pages/RefundRequests";
import NotFound from "./pages/NotFound";
import ScrollToTop from "./components/ScrollToTop";

const queryClient = new QueryClient();

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
                  <ProtectedRoute requireManager>
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
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
