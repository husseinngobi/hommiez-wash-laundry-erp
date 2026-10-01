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
import { Users, Plus, DollarSign, Calendar, CreditCard, Edit, Trash2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

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
    payment_period: new Date().toISOString().slice(0, 7), // YYYY-MM
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
    setLoading(true);
    try {
      if (!token) return;
      await axios.post(
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
      fetchEmployees();
    } catch (error: unknown) {
      console.error('Failed to add employee:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to add employee');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!token) return;
      const employee = employees.find(emp => emp.id === parseInt(paymentForm.employee_id));
      if (!employee) {
        toast.error('Employee not found');
        return;
      }

      const deductions = parseFloat(paymentForm.deductions);
      const bonuses = parseFloat(paymentForm.bonuses);
      const netAmount = employee.salary_amount - deductions + bonuses;

      await axios.post(
        `${API_BASE_URL}/payroll/payments`,
        {
          employee_id: parseInt(paymentForm.employee_id),
          payment_period: paymentForm.payment_period,
          amount_paid: employee.salary_amount,
          deductions,
          bonuses,
          net_amount: netAmount,
          payment_method: paymentForm.payment_method,
          notes: paymentForm.notes,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast.success('Salary payment processed successfully');
      setShowProcessPayment(false);
      setPaymentForm({
        employee_id: '',
        payment_period: new Date().toISOString().slice(0, 7),
        deductions: '0',
        bonuses: '0',
        payment_method: 'BANK_TRANSFER',
        notes: '',
      });
      fetchPayments();
    } catch (error: unknown) {
      console.error('Failed to process payment:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentEmployeeChange = (employeeId: string) => {
    const employee = employees.find((item) => item.id === parseInt(employeeId, 10));
    const today = new Date();
    const defaultPeriod = employee?.payment_frequency === 'DAILY'
      ? today.toISOString().slice(0, 10)
      : today.toISOString().slice(0, 7);

    setPaymentForm((current) => ({
      ...current,
      employee_id: employeeId,
      payment_period: defaultPeriod,
    }));
  };

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    
    try {
      setLoading(true);
      if (!token) return;
      await axios.put(
        `${API_BASE_URL}/payroll/employees/${editingEmployee.id}`,
        editingEmployee,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast.success('Employee updated successfully');
      setShowEditEmployee(false);
      setEditingEmployee(null);
      fetchEmployees();
    } catch (error: unknown) {
      console.error('Failed to update employee:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to update employee');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEmployee = async (employeeId: number, employeeName: string) => {
    if (!confirm(`Are you sure you want to delete ${employeeName}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      setLoading(true);
      if (!token) return;
      await axios.delete(`${API_BASE_URL}/payroll/employees/${employeeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Employee deleted successfully');
      fetchEmployees();
    } catch (error: unknown) {
      console.error('Failed to delete employee:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to delete employee');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (employeeId: number, newStatus: string) => {
    try {
      setLoading(true);
      if (!token) return;
      await axios.patch(
        `${API_BASE_URL}/payroll/employees/${employeeId}/status`,
        { employment_status: newStatus },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast.success(`Employee status updated to ${newStatus}`);
      fetchEmployees();
    } catch (error: unknown) {
      console.error('Failed to update status:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to update status');
    } finally {
      setLoading(false);
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
              {payments.length > 0 ? new Date(payments[0].payment_date).toLocaleDateString() : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Most recent</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
        <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
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
                <Button type="button" variant="outline" onClick={() => setShowAddEmployee(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Adding...' : 'Add Employee'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={showProcessPayment} onOpenChange={setShowProcessPayment}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-green-600 hover:bg-green-700">
              <CreditCard className="h-4 w-4" />
              Process Salary Payment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Salary Payment</DialogTitle>
              <DialogDescription>
                Record a salary payment for an employee
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
                    {activeEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.employee_name} - {emp.position} ({formatUGX(emp.salary_amount)} / {paymentFrequencyLabel(emp.payment_frequency)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    const employee = employees.find(e => e.id === parseInt(paymentForm.employee_id));
                    const deductions = parseFloat(paymentForm.deductions);
                    const bonuses = parseFloat(paymentForm.bonuses);
                    const netAmount = employee ? employee.salary_amount - deductions + bonuses : 0;
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span>Base Salary:</span>
                          <span>{formatUGX(employee?.salary_amount)} / {paymentFrequencyLabel(employee?.payment_frequency || 'MONTHLY')}</span>
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
                <Button type="button" variant="outline" onClick={() => setShowProcessPayment(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !paymentForm.employee_id}>
                  {loading ? 'Processing...' : 'Process Payment'}
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
                      <SelectTrigger className="w-32">
                        <SelectValue />
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
                        onClick={() => handleDeleteEmployee(employee.id, employee.employee_name)}
                        title="Delete employee"
                      >
                        <Trash2 className="h-4 w-4" />
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
                <Button type="submit" disabled={loading}>
                  {loading ? 'Updating...' : 'Update Employee'}
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
                <TableHead className="font-semibold dark:text-gray-100">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
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
                  <TableCell className="dark:text-gray-100">{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
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
