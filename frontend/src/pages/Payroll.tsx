import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Users, Plus, DollarSign, Calendar, CreditCard, Edit, Trash2, Eye, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { formatKampalaDate, kampalaTodayYmd } from '@/lib/businessDate';

interface Employee {
  id: number;
  employee_name: string;
  employee_id_number: string;
  position: string;
  phone: string;
  email: string;
  salary_amount: number;
  payment_frequency: string;
  bank_account: string;
  bank_name: string;
  hire_date: string;
  employment_status: string;
  branch_id?: number | null;
  branch_name?: string | null;
}

interface SalaryPayment {
  id: number;
  employee_name: string;
  position: string;
  payment_date: string;
  payment_period: string;
  amount_paid: number;
  deductions: number;
  bonuses: number;
  net_amount: number;
  payment_method: string;
  payment_status: string;
  branch_name?: string | null;
}

export default function Payroll() {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<'add' | 'payment' | 'edit' | 'delete' | 'status' | null>(null);
  const [busyEmployeeId, setBusyEmployeeId] = useState<number | null>(null);
  const mutationInFlight = useRef(false);
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [branchFilter, setBranchFilter] = useState('all');
  
  // Pagination for employees
  const [employeePage, setEmployeePage] = useState(1);
  const [employeeTotalPages, setEmployeeTotalPages] = useState(1);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const employeesPerPage = 10;

  // Pagination for payments
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentTotalPages, setPaymentTotalPages] = useState(1);
  const [totalPayments, setTotalPayments] = useState(0);
  const paymentsPerPage = 15;
  
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showProcessPayment, setShowProcessPayment] = useState(false);
  const [showEditEmployee, setShowEditEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEmployeeDetails, setShowEmployeeDetails] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeSalaryHistory, setEmployeeSalaryHistory] = useState<SalaryPayment[]>([]);
  const [loadingEmployeeHistory, setLoadingEmployeeHistory] = useState(false);
  
  // Add Employee Form
  const [newEmployee, setNewEmployee] = useState({
    employee_name: '',
    employee_id_number: '',
    position: '',
    phone: '',
    email: '',
    salary_amount: '',
    payment_frequency: 'MONTHLY',
    bank_account: '',
    bank_name: '',
    hire_date: '',
    branch_id: '',
  });

  // Process Payment Form
  const [paymentForm, setPaymentForm] = useState({
    employee_id: '',
    payment_period: kampalaTodayYmd().slice(0, 7), // YYYY-MM
    payment_date: kampalaTodayYmd(),
    amount_paid: '',
    deductions: '0',
    bonuses: '0',
    payment_method: 'BANK_TRANSFER',
    notes: '',
  });

  const paymentFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'DAILY': return 'Daily';
      case 'WEEKLY': return 'Weekly';
      case 'BI_WEEKLY': return 'Bi-weekly';
      default: return 'Monthly';
    }
  };

  const fetchEmployees = useCallback(async () => {
    try {
      if (!token) return;
      const response = await axios.get(`${API_BASE_URL}/payroll/employees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployees(response.data);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  }, [token]);

  const fetchPayments = useCallback(async () => {
    try {
      if (!token) return;
      const response = await axios.get(`${API_BASE_URL}/payroll/payments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPayments(response.data);
    } catch (error) {
      console.error('Failed to fetch payments:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchEmployees();
    fetchPayments();
  }, [fetchEmployees, fetchPayments]);

  useEffect(() => {
    if (!token) return;
    axios.get(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setBranches(res.data.branches || []))
      .catch(() => setBranches([]));
  }, [token]);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setLoading(true);
    setBusyAction('add');
    try {
      if (!token) return;
      const response = await axios.post(
        `${API_BASE_URL}/payroll/employees`,
        {
          ...newEmployee,
          salary_amount: parseFloat(newEmployee.salary_amount),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast.success('Employee added successfully');
      setEmployees((current) => [response.data, ...current.filter((employee) => employee.id !== response.data.id)]);
      setEmployeePage(1);
      setShowAddEmployee(false);
      setNewEmployee({
        employee_name: '',
        employee_id_number: '',
        position: '',
        phone: '',
        email: '',
        salary_amount: '',
        payment_frequency: 'MONTHLY',
        bank_account: '',
        bank_name: '',
        hire_date: '',
        branch_id: '',
      });
      await fetchEmployees();
    } catch (error: unknown) {
      console.error('Failed to add employee:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to add employee');
    } finally {
      mutationInFlight.current = false;
      setLoading(false);
      setBusyAction(null);
    }
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setLoading(true);
    setBusyAction('payment');
    try {
      if (!token) return;
      const employee = employees.find(emp => emp.id === parseInt(paymentForm.employee_id));
      if (!employee) {
        toast.error('Employee not found');
        return;
      }

      const deductions = Number(paymentForm.deductions || 0);
      const bonuses = Number(paymentForm.bonuses || 0);
      const amountPaid = Number(paymentForm.amount_paid);
      if (!Number.isFinite(amountPaid) || amountPaid <= 0 || !paymentForm.payment_date) {
        toast.error('Enter a valid gross amount and paid date');
        return;
      }
      const netAmount = amountPaid - deductions + bonuses;
      if (!Number.isFinite(netAmount) || netAmount < 0) {
        toast.error('Deductions cannot exceed the gross salary plus bonuses');
        return;
      }

      await axios.post(
        `${API_BASE_URL}/payroll/payments`,
        {
          employee_id: parseInt(paymentForm.employee_id),
          payment_period: paymentForm.payment_period,
          payment_date: paymentForm.payment_date,
          amount_paid: amountPaid,
          deductions,
          bonuses,
          net_amount: netAmount,
          payment_method: paymentForm.payment_method,
          notes: paymentForm.notes || (paymentForm.payment_date < kampalaTodayYmd() ? 'Historical salary payment' : ''),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast.success('Salary payment processed successfully');
      setShowProcessPayment(false);
      setPaymentForm({
        employee_id: '',
        payment_period: kampalaTodayYmd().slice(0, 7),
        payment_date: kampalaTodayYmd(),
        amount_paid: '',
        deductions: '0',
        bonuses: '0',
        payment_method: 'BANK_TRANSFER',
        notes: '',
      });
      setPaymentPage(1);
      await fetchPayments();
      if (selectedEmployee?.id === employee.id) await handleViewEmployee(employee);
    } catch (error: unknown) {
      console.error('Failed to process payment:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to process payment');
    } finally {
      mutationInFlight.current = false;
      setLoading(false);
      setBusyAction(null);
    }
  };

  const handlePaymentEmployeeChange = (employeeId: string) => {
    const employee = employees.find((item) => item.id === parseInt(employeeId, 10));
    const today = kampalaTodayYmd();
    const defaultPeriod = employee?.payment_frequency === 'DAILY'
      ? today
      : today.slice(0, 7);

    setPaymentForm((current) => ({
      ...current,
      employee_id: employeeId,
      payment_period: defaultPeriod,
      payment_date: today,
      amount_paid: employee ? String(employee.salary_amount) : '',
    }));
  };

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusyAction('edit');
    
    try {
      setLoading(true);
      if (!token) return;
      const response = await axios.put(
        `${API_BASE_URL}/payroll/employees/${editingEmployee.id}`,
        editingEmployee,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setEmployees((current) => current.map((employee) => employee.id === editingEmployee.id
        ? {
          ...employee,
          ...response.data,
          branch_name: branches.find((branch) => String(branch.id) === String(response.data.branch_id))?.name || null,
        }
        : employee));
      toast.success('Employee updated successfully');
      setShowEditEmployee(false);
      setEditingEmployee(null);
      await fetchEmployees();
    } catch (error: unknown) {
      console.error('Failed to update employee:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to update employee');
    } finally {
      mutationInFlight.current = false;
      setLoading(false);
      setBusyAction(null);
    }
  };

  const handleViewEmployee = async (employee: Employee) => {
    setSelectedEmployee(employee);
    setEmployeeSalaryHistory([]);
    setShowEmployeeDetails(true);
    setLoadingEmployeeHistory(true);
    try {
      if (!token) return;
      const response = await axios.get(`${API_BASE_URL}/payroll/employees/${employee.id}/payments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployeeSalaryHistory(response.data);
    } catch (error) {
      console.error('Failed to fetch employee salary history:', error);
      toast.error('Failed to load salary history');
    } finally {
      setLoadingEmployeeHistory(false);
    }
  };

  const handleDeleteEmployee = async (employeeId: number, employeeName: string) => {
    if (mutationInFlight.current) return;
    if (!confirm(`Are you sure you want to delete ${employeeName}? This action cannot be undone.`)) {
      return;
    }
    mutationInFlight.current = true;
    setBusyAction('delete');
    setBusyEmployeeId(employeeId);
    try {
      setLoading(true);
      if (!token) return;
      await axios.delete(`${API_BASE_URL}/payroll/employees/${employeeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Employee deleted successfully');
      setEmployees((current) => current.filter((employee) => employee.id !== employeeId));
      await fetchEmployees();
    } catch (error: unknown) {
      console.error('Failed to delete employee:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to delete employee');
    } finally {
      mutationInFlight.current = false;
      setLoading(false);
      setBusyAction(null);
      setBusyEmployeeId(null);
    }
  };

  const handleStatusChange = async (employeeId: number, newStatus: string) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusyAction('status');
    setBusyEmployeeId(employeeId);
    try {
      setLoading(true);
      if (!token) return;
      const response = await axios.patch(
        `${API_BASE_URL}/payroll/employees/${employeeId}/status`,
        { employment_status: newStatus },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setEmployees((current) => current.map((employee) => employee.id === employeeId ? { ...employee, ...response.data } : employee));
      toast.success(`Employee status updated to ${newStatus}`);
      await fetchEmployees();
    } catch (error: unknown) {
      console.error('Failed to update status:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to update status');
    } finally {
      mutationInFlight.current = false;
      setLoading(false);
      setBusyAction(null);
      setBusyEmployeeId(null);
    }
  };

  const filteredEmployees = branchFilter === 'all'
    ? employees
    : employees.filter((e) => String(e.branch_id) === branchFilter);
  const activeEmployees = filteredEmployees.filter(e => e.employment_status === 'ACTIVE');
  const totalActiveEmployees = activeEmployees.length;

  // Pagination calculation for employees
  const paginatedEmployees = filteredEmployees.slice(
    (employeePage - 1) * employeesPerPage,
    employeePage * employeesPerPage
  );

  const selectedBranchName = branches.find((b) => String(b.id) === branchFilter)?.name;
  const filteredPayments = branchFilter === 'all'
    ? payments
    : payments.filter((p) => p.branch_name === selectedBranchName);

  // Pagination calculation for payments
  const paginatedPayments = filteredPayments.slice(
    (paymentPage - 1) * paymentsPerPage,
    paymentPage * paymentsPerPage
  );

  // Update employee pagination when employees list changes
  useEffect(() => {
    const pages = Math.ceil(filteredEmployees.length / employeesPerPage);
    setEmployeeTotalPages(pages || 1);
    setTotalEmployees(filteredEmployees.length);
    if (employeePage > pages && pages > 0) {
      setEmployeePage(pages);
    }
  }, [filteredEmployees.length, employeePage]);

  // Update payment pagination when payments list changes
  useEffect(() => {
    const pages = Math.ceil(filteredPayments.length / paymentsPerPage);
    setPaymentTotalPages(pages || 1);
    setTotalPayments(filteredPayments.length);
    if (paymentPage > pages && pages > 0) {
      setPaymentPage(pages);
    }
  }, [filteredPayments.length, paymentPage]);
  const totalConfiguredPay = activeEmployees.reduce((sum, e) => sum + Number(e.salary_amount), 0);
  const payBasisCounts = activeEmployees.reduce<Record<string, number>>((counts, employee) => {
    const frequency = employee.payment_frequency || 'MONTHLY';
    counts[frequency] = (counts[frequency] || 0) + 1;
    return counts;
  }, {});
  return (
    <MainLayout title="Payroll Management" subtitle="Manage employees and salary payments">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeEmployees.length}</div>
            <p className="text-xs text-muted-foreground mt-1">On payroll</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Configured Pay</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 break-words">
              {formatUGX(totalConfiguredPay)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Amounts shown in each worker&apos;s pay basis</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pay Basis Mix</CardTitle>
            <Calendar className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold text-purple-600 space-y-1">
              {['MONTHLY', 'BI_WEEKLY', 'WEEKLY', 'DAILY'].map((frequency) => (
                <div key={frequency} className="flex justify-between gap-3">
                  <span>{paymentFrequencyLabel(frequency)}</span>
                  <span>{payBasisCounts[frequency] || 0}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Active employees by configured basis</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Payment</CardTitle>
            <CreditCard className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {payments.length > 0 ? formatKampalaDate(payments[0].payment_date) : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Most recent</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
        <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700" disabled={loading}>
              <Plus className="h-4 w-4" />
              Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>
                Add a new employee to the payroll system
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employee_name">Full Name *</Label>
                  <Input
                    id="employee_name"
                    required
                    value={newEmployee.employee_name}
                    onChange={(e) => setNewEmployee({...newEmployee, employee_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee_id_number">Employee ID</Label>
                  <Input
                    id="employee_id_number"
                    placeholder="Auto-generated"
                    disabled
                    value={newEmployee.employee_id_number}
                    className="bg-gray-100 dark:bg-gray-800"
                  />
                  <p className="text-xs text-muted-foreground">System will auto-generate ID</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">Position *</Label>
                  <Input
                    id="position"
                    required
                    value={newEmployee.position}
                    onChange={(e) => setNewEmployee({...newEmployee, position: e.target.value})}
                    placeholder="e.g., Iron Worker, Washer, Delivery Agent"
                  />
                  <p className="text-xs text-muted-foreground">Specify the worker's role</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    required
                    value={newEmployee.phone}
                    onChange={(e) => setNewEmployee({...newEmployee, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newEmployee.email}
                    onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary_amount">
                    {newEmployee.payment_frequency === 'DAILY' ? 'Daily Rate' :
                      newEmployee.payment_frequency === 'WEEKLY' ? 'Weekly Pay' :
                      newEmployee.payment_frequency === 'BI_WEEKLY' ? 'Bi-weekly Pay' : 'Monthly Salary'} (UGX) *
                  </Label>
                  <Input
                    id="salary_amount"
                    type="number"
                    required
                    value={newEmployee.salary_amount}
                    onChange={(e) => setNewEmployee({...newEmployee, salary_amount: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pay basis *</Label>
                  <Select
                    value={newEmployee.payment_frequency}
                    onValueChange={(value) => setNewEmployee({...newEmployee, payment_frequency: value})}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Monthly salary</SelectItem>
                      <SelectItem value="BI_WEEKLY">Bi-weekly</SelectItem>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="DAILY">Daily rate</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">The amount above is the agreed amount for this pay period.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bank_name">Bank Name</Label>
                  <Input
                    id="bank_name"
                    value={newEmployee.bank_name}
                    onChange={(e) => setNewEmployee({...newEmployee, bank_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bank_account">Bank Account Number</Label>
                  <Input
                    id="bank_account"
                    value={newEmployee.bank_account}
                    onChange={(e) => setNewEmployee({...newEmployee, bank_account: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hire_date">Hire Date *</Label>
                  <Input
                    id="hire_date"
                    type="date"
                    required
                    value={newEmployee.hire_date}
                    onChange={(e) => setNewEmployee({...newEmployee, hire_date: e.target.value})}
                  />
                </div>
                {branches.length > 0 && (
                  <div className="space-y-2">
                    <Label>Branch *</Label>
                    <Select
                      value={newEmployee.branch_id}
                      onValueChange={(value) => setNewEmployee({...newEmployee, branch_id: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="outline" onClick={() => setShowAddEmployee(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className={loading ? 'opacity-60' : ''}>
                  {busyAction === 'add' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding...</> : 'Add Employee'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={showProcessPayment} onOpenChange={setShowProcessPayment}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-green-600 hover:bg-green-700" disabled={loading}>
              <CreditCard className="h-4 w-4" />
              Process Salary Payment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Salary Payment</DialogTitle>
              <DialogDescription>
              Record a current or historical salary payment for an employee
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleProcessPayment} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="employee_id">Select Employee *</Label>
                <Select
                  value={paymentForm.employee_id}
                  onValueChange={handlePaymentEmployeeChange}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.employee_name} - {emp.position} ({formatUGX(emp.salary_amount)} / {paymentFrequencyLabel(emp.payment_frequency)} · {emp.employment_status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payment_date">Date paid *</Label>
                  <Input
                    id="payment_date"
                    type="date"
                    required
                    max={kampalaTodayYmd()}
                    value={paymentForm.payment_date}
                    onChange={(e) => {
                      const paymentDate = e.target.value;
                      const employee = employees.find((item) => item.id === Number(paymentForm.employee_id));
                      setPaymentForm({
                        ...paymentForm,
                        payment_date: paymentDate,
                        payment_period: employee?.payment_frequency === 'DAILY' ? paymentDate : paymentDate.slice(0, 7),
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Use the original date for a historical salary payment; accounting reports use this date.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount_paid">Gross salary paid (UGX) *</Label>
                  <Input
                    id="amount_paid"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={paymentForm.amount_paid}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Defaults to the employee’s current pay rate; adjust to the actual historical amount if needed.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment_period">Payment Period *</Label>
                <Input
                  id="payment_period"
                  type="text"
                  required
                  value={paymentForm.payment_period}
                  placeholder="e.g. 2026-10, 2026-10-01, or 2026-W40"
                  onChange={(e) => setPaymentForm({...paymentForm, payment_period: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="deductions">Deductions (UGX)</Label>
                  <Input
                    id="deductions"
                    type="number"
                    value={paymentForm.deductions}
                    onChange={(e) => setPaymentForm({...paymentForm, deductions: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground">Tax, NSSF, etc.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bonuses">Bonuses (UGX)</Label>
                  <Input
                    id="bonuses"
                    type="number"
                    value={paymentForm.bonuses}
                    onChange={(e) => setPaymentForm({...paymentForm, bonuses: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground">Performance, overtime</p>
                </div>
              </div>

              {paymentForm.employee_id && (
                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                  <p className="text-sm font-medium mb-2">Payment Summary</p>
                  {(() => {
                    const deductions = Number(paymentForm.deductions || 0);
                    const bonuses = Number(paymentForm.bonuses || 0);
                    const netAmount = Number(paymentForm.amount_paid) - deductions + bonuses;
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span>Gross salary paid:</span>
                          <span>{formatUGX(Number(paymentForm.amount_paid) || 0)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-red-600">
                          <span>Deductions:</span>
                          <span>- {formatUGX(deductions)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Bonuses:</span>
                          <span>+ {formatUGX(bonuses)}</span>
                        </div>
                        <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
                          <span>Net Amount:</span>
                          <span>{formatUGX(netAmount)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="payment_method">Payment Method *</Label>
                <Select
                  value={paymentForm.payment_method}
                  onValueChange={(value) => setPaymentForm({...paymentForm, payment_method: value})}
                  required
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CHECK">Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                  placeholder="Optional payment notes"
                />
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="outline" onClick={() => setShowProcessPayment(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !paymentForm.employee_id} className={loading ? 'opacity-60' : ''}>
                  {busyAction === 'payment' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Process Payment'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Employees Table */}
      <Card className="mb-6">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>Employees on Payroll</CardTitle>
          {branches.length > 1 && (
            <Select value={branchFilter} onValueChange={(v) => { setBranchFilter(v); }}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 dark:bg-gray-800">
                <TableHead className="font-semibold dark:text-gray-100">Employee</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Position</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Branch</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Phone</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Pay Amount</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Bank</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Hire Date</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Status</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No employees found
                  </TableCell>
                </TableRow>
              ) : (
                paginatedEmployees.map((employee) => (
                <TableRow key={employee.id} className="hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150">
                  <TableCell>
                    <div>
                      <p className="font-medium dark:text-gray-100">{employee.employee_name}</p>
                      <p className="text-sm text-muted-foreground">ID: {employee.employee_id_number}</p>
                    </div>
                  </TableCell>
                  <TableCell className="dark:text-gray-100">{employee.position}</TableCell>
                  <TableCell className="dark:text-gray-100">{employee.branch_name || '—'}</TableCell>
                  <TableCell className="dark:text-gray-100 break-all">{employee.phone}</TableCell>
                  <TableCell className="font-semibold text-green-600">
                    {formatUGX(employee.salary_amount)}
                  </TableCell>
                  <TableCell className="dark:text-gray-100">
                    {employee.bank_name || 'N/A'}
                    {employee.bank_account && <p className="text-xs text-muted-foreground">{employee.bank_account}</p>}
                  </TableCell>
                  <TableCell className="dark:text-gray-100">{new Date(employee.hire_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Select
                      value={employee.employment_status}
                      onValueChange={(value) => handleStatusChange(employee.id, value)}
                      disabled={loading}
                    >
                      <SelectTrigger className={`w-32 ${busyEmployeeId === employee.id ? 'opacity-60' : ''}`}>
                        {busyAction === 'status' && busyEmployeeId === employee.id
                          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving</>
                          : <SelectValue />}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">
                          <Badge variant="default">ACTIVE</Badge>
                        </SelectItem>
                        <SelectItem value="SUSPENDED">
                          <Badge variant="secondary">SUSPENDED</Badge>
                        </SelectItem>
                        <SelectItem value="TERMINATED">
                          <Badge variant="destructive">TERMINATED</Badge>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={() => handleViewEmployee(employee)}
                        title="View employee and salary history"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={() => {
                          setEditingEmployee(employee);
                          setShowEditEmployee(true);
                        }}
                        title="Edit employee details"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={loading}
                        className={busyEmployeeId === employee.id ? 'opacity-60' : ''}
                        onClick={() => handleDeleteEmployee(employee.id, employee.employee_name)}
                        title="Delete employee"
                      >
                        {busyAction === 'delete' && busyEmployeeId === employee.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
              )}
            </TableBody>
          </Table>
          </div>

          {/* Pagination for Employees */}
          {employeeTotalPages > 1 && (
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-muted-foreground text-center sm:text-left">
                <span className="hidden sm:inline">Showing {((employeePage - 1) * employeesPerPage) + 1} to {Math.min(employeePage * employeesPerPage, totalEmployees)} of {totalEmployees} employees</span>
                <span className="sm:hidden">{((employeePage - 1) * employeesPerPage) + 1}-{Math.min(employeePage * employeesPerPage, totalEmployees)} of {totalEmployees}</span>
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setEmployeePage(prev => Math.max(1, prev - 1))}
                      className={employeePage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {[...Array(Math.min(5, employeeTotalPages))].map((_, i) => {
                    let pageNum;
                    if (employeeTotalPages <= 5) {
                      pageNum = i + 1;
                    } else if (employeePage <= 3) {
                      pageNum = i + 1;
                    } else if (employeePage >= employeeTotalPages - 2) {
                      pageNum = employeeTotalPages - 4 + i;
                    } else {
                      pageNum = employeePage - 2 + i;
                    }
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setEmployeePage(pageNum)}
                          isActive={employeePage === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setEmployeePage(prev => Math.min(employeeTotalPages, prev + 1))}
                      className={employeePage === employeeTotalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee details and salary history */}
      <Dialog open={showEmployeeDetails} onOpenChange={setShowEmployeeDetails}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedEmployee?.employee_name}</DialogTitle>
            <DialogDescription>
              {selectedEmployee?.position} · {paymentFrequencyLabel(selectedEmployee?.payment_frequency || 'MONTHLY')} ·
              {' '}{formatUGX(selectedEmployee?.salary_amount || 0)} per period
            </DialogDescription>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Employee ID:</span> {selectedEmployee.employee_id_number}</div>
                <div><span className="text-muted-foreground">Phone:</span> {selectedEmployee.phone || '—'}</div>
                <div><span className="text-muted-foreground">Email:</span> {selectedEmployee.email || '—'}</div>
                <div><span className="text-muted-foreground">Branch:</span> {selectedEmployee.branch_name || '—'}</div>
                <div><span className="text-muted-foreground">Hire date:</span> {new Date(selectedEmployee.hire_date).toLocaleDateString()}</div>
                <div><span className="text-muted-foreground">Status:</span> {selectedEmployee.employment_status}</div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Salary payment history</h3>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Net amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Paid date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingEmployeeHistory ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-6">Loading history…</TableCell></TableRow>
                      ) : employeeSalaryHistory.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No salary payments recorded</TableCell></TableRow>
                      ) : employeeSalaryHistory.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{payment.payment_period}</TableCell>
                          <TableCell className="font-semibold">{formatUGX(payment.net_amount)}</TableCell>
                          <TableCell>{payment.payment_method}</TableCell>
                          <TableCell><Badge variant={payment.payment_status === 'PAID' ? 'default' : 'secondary'}>{payment.payment_status}</Badge></TableCell>
                          <TableCell>{formatKampalaDate(payment.payment_date)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog */}
      <Dialog open={showEditEmployee} onOpenChange={setShowEditEmployee}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>
              Update employee information and salary details
            </DialogDescription>
          </DialogHeader>
          {editingEmployee && (
            <form onSubmit={handleEditEmployee} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_employee_name">Full Name *</Label>
                  <Input
                    id="edit_employee_name"
                    required
                    value={editingEmployee.employee_name}
                    onChange={(e) => setEditingEmployee({...editingEmployee, employee_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_employee_id">Employee ID</Label>
                  <Input
                    id="edit_employee_id"
                    disabled
                    value={editingEmployee.employee_id_number}
                    className="bg-gray-100 dark:bg-gray-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_position">Position *</Label>
                  <Input
                    id="edit_position"
                    required
                    value={editingEmployee.position}
                    onChange={(e) => setEditingEmployee({...editingEmployee, position: e.target.value})}
                    placeholder="e.g., Iron Worker, Washer, Delivery Agent"
                  />
                </div>
                {branches.length > 0 && (
                  <div className="space-y-2">
                    <Label>Branch</Label>
                    <Select
                      value={editingEmployee.branch_id ? String(editingEmployee.branch_id) : ''}
                      onValueChange={(value) => setEditingEmployee({...editingEmployee, branch_id: Number(value)})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="edit_phone">Phone Number *</Label>
                  <Input
                    id="edit_phone"
                    required
                    value={editingEmployee.phone}
                    onChange={(e) => setEditingEmployee({...editingEmployee, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={editingEmployee.email || ''}
                    onChange={(e) => setEditingEmployee({...editingEmployee, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_salary">
                    {editingEmployee.payment_frequency === 'DAILY' ? 'Daily Rate' :
                      editingEmployee.payment_frequency === 'WEEKLY' ? 'Weekly Pay' :
                      editingEmployee.payment_frequency === 'BI_WEEKLY' ? 'Bi-weekly Pay' : 'Monthly Salary'} (UGX) *
                  </Label>
                  <Input
                    id="edit_salary"
                    type="number"
                    required
                    value={editingEmployee.salary_amount}
                    onChange={(e) => setEditingEmployee({...editingEmployee, salary_amount: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pay basis *</Label>
                  <Select
                    value={editingEmployee.payment_frequency}
                    onValueChange={(value) => setEditingEmployee({...editingEmployee, payment_frequency: value})}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Monthly salary</SelectItem>
                      <SelectItem value="BI_WEEKLY">Bi-weekly</SelectItem>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="DAILY">Daily rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_bank_name">Bank Name</Label>
                  <Input
                    id="edit_bank_name"
                    value={editingEmployee.bank_name || ''}
                    onChange={(e) => setEditingEmployee({...editingEmployee, bank_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_bank_account">Bank Account</Label>
                  <Input
                    id="edit_bank_account"
                    value={editingEmployee.bank_account || ''}
                    onChange={(e) => setEditingEmployee({...editingEmployee, bank_account: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="outline" onClick={() => {
                  setShowEditEmployee(false);
                  setEditingEmployee(null);
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className={loading ? 'opacity-60' : ''}>
                  {busyAction === 'edit' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : 'Update Employee'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Salary Payments</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            History of processed salary payments - tracks all payments made to employees
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 dark:bg-gray-800">
                <TableHead className="font-semibold dark:text-gray-100">Employee</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Branch</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Period</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Gross Amount</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Deductions</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Bonuses</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Net Amount</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Method</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Status</TableHead>
                <TableHead className="font-semibold dark:text-gray-100">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No payment records found
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPayments.map((payment) => (
                <TableRow key={payment.id} className="hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150">
                  <TableCell>
                    <div>
                      <p className="font-medium dark:text-gray-100">{payment.employee_name}</p>
                      <p className="text-sm text-muted-foreground">{payment.position}</p>
                    </div>
                  </TableCell>
                  <TableCell className="dark:text-gray-100">{payment.branch_name || '—'}</TableCell>
                  <TableCell className="dark:text-gray-100">{payment.payment_period}</TableCell>
                  <TableCell className="dark:text-gray-100">{formatUGX(payment.amount_paid)}</TableCell>
                  <TableCell className="text-red-600">- {formatUGX(payment.deductions)}</TableCell>
                  <TableCell className="text-green-600">+ {formatUGX(payment.bonuses)}</TableCell>
                  <TableCell className="font-semibold text-blue-600">
                    {formatUGX(payment.net_amount)}
                  </TableCell>
                  <TableCell className="dark:text-gray-100">{payment.payment_method}</TableCell>
                  <TableCell><Badge variant={payment.payment_status === 'PAID' ? 'default' : 'secondary'}>{payment.payment_status}</Badge></TableCell>
                  <TableCell className="dark:text-gray-100">{formatKampalaDate(payment.payment_date)}</TableCell>
                </TableRow>
              ))
              )}
            </TableBody>
          </Table>
          </div>

          {/* Pagination for Payments */}
          {paymentTotalPages > 1 && (
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-muted-foreground text-center sm:text-left">
                <span className="hidden sm:inline">Showing {((paymentPage - 1) * paymentsPerPage) + 1} to {Math.min(paymentPage * paymentsPerPage, totalPayments)} of {totalPayments} payments</span>
                <span className="sm:hidden">{((paymentPage - 1) * paymentsPerPage) + 1}-{Math.min(paymentPage * paymentsPerPage, totalPayments)} of {totalPayments}</span>
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setPaymentPage(prev => Math.max(1, prev - 1))}
                      className={paymentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {[...Array(Math.min(5, paymentTotalPages))].map((_, i) => {
                    let pageNum;
                    if (paymentTotalPages <= 5) {
                      pageNum = i + 1;
                    } else if (paymentPage <= 3) {
                      pageNum = i + 1;
                    } else if (paymentPage >= paymentTotalPages - 2) {
                      pageNum = paymentTotalPages - 4 + i;
                    } else {
                      pageNum = paymentPage - 2 + i;
                    }
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setPaymentPage(pageNum)}
                          isActive={paymentPage === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setPaymentPage(prev => Math.min(paymentTotalPages, prev + 1))}
                      className={paymentPage === paymentTotalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
