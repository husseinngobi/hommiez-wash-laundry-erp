import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const PAYMENT_FREQUENCIES = ['MONTHLY', 'BI_WEEKLY', 'WEEKLY', 'DAILY'];

// Get all employees
router.get('/employees', authenticate as any, requireAdmin as any, (async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT pe.*, b.name as branch_name
      FROM payroll_employees pe
      LEFT JOIN branches b ON pe.branch_id = b.id
      ORDER BY hire_date DESC
    `);
    // Convert salary_amount from string to number
    const employees = result.rows.map(row => ({
      ...row,
      salary_amount: parseFloat(row.salary_amount)
    }));
    res.json(employees);
  } catch (error: any) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
}) as any);

// Add new employee
router.post('/employees', authenticate as any, requireAdmin as any, (async (req: AuthRequest, res: Response) => {
  try {
    const {
      employee_name,
      position,
      phone,
      email,
      salary_amount,
      payment_frequency,
      bank_account,
      bank_name,
      hire_date,
      branch_id,
    } = req.body;

    // Validate required fields (employee_id_number is now auto-generated)
    if (!employee_name || !position || !phone || !salary_amount || !hire_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!PAYMENT_FREQUENCIES.includes(String(payment_frequency || 'MONTHLY').toUpperCase())) {
      return res.status(400).json({ error: 'Payment frequency must be monthly, bi-weekly, weekly, or daily' });
    }

    // Auto-generate employee ID in format EMP-YYYYMMDD-XXX
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Get count of employees created today
    const countResult = await query(
      `SELECT COUNT(*) FROM payroll_employees 
       WHERE employee_id_number LIKE $1`,
      [`EMP-${dateStr}-%`]
    );
    const count = parseInt(countResult.rows[0].count) + 1;
    const employee_id_number = `EMP-${dateStr}-${count.toString().padStart(3, '0')}`;

    const result = await query(
      `INSERT INTO payroll_employees (
        employee_name, employee_id_number, position, phone, email,
        salary_amount, payment_frequency, bank_account, bank_name,
        hire_date, employment_status, added_by, branch_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', $11, $12)
      RETURNING *`,
      [
        employee_name,
        employee_id_number,
        position,
        phone,
        email || null,
        salary_amount,
        String(payment_frequency || 'MONTHLY').toUpperCase(),
        bank_account || null,
        bank_name || null,
        hire_date,
        req.user!.id,
        branch_id ? Number(branch_id) : (req.user!.branch_id ?? null),
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error adding employee:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Employee ID already exists' });
    }
    res.status(500).json({ error: 'Failed to add employee' });
  }
}) as any);

// Get all salary payments
router.get('/payments', authenticate as any, requireAdmin as any, (async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        sp.*,
        pe.employee_name,
        pe.position,
        pe.branch_id,
        b.name as branch_name
      FROM salary_payments sp
      JOIN payroll_employees pe ON sp.employee_id = pe.id
      LEFT JOIN branches b ON pe.branch_id = b.id
      ORDER BY sp.payment_date DESC
      LIMIT 50
    `);
    // Convert numeric fields from strings to numbers
    const payments = result.rows.map(row => ({
      ...row,
      amount_paid: parseFloat(row.amount_paid),
      deductions: parseFloat(row.deductions),
      bonuses: parseFloat(row.bonuses),
      net_amount: parseFloat(row.net_amount)
    }));
    res.json(payments);
  } catch (error: any) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
}) as any);

// Process salary payment
router.post('/payments', authenticate as any, requireAdmin as any, (async (req: AuthRequest, res: Response) => {
  try {
    const {
      employee_id,
      payment_period,
      amount_paid,
      deductions,
      bonuses,
      net_amount,
      payment_method,
      notes
    } = req.body;

    // Validate required fields
    if (!employee_id || !payment_period || !amount_paid || net_amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if payment for this period already exists
    const existingPayment = await query(
      `SELECT id FROM salary_payments 
       WHERE employee_id = $1 AND payment_period = $2`,
      [employee_id, payment_period]
    );

    if (existingPayment.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Payment for this employee and period already exists' 
      });
    }

    const result = await query(
      `INSERT INTO salary_payments (
        employee_id, payment_date, payment_period, amount_paid,
        payment_method, deductions, bonuses, net_amount,
        paid_by, payment_status, notes
      ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, 'PAID', $9)
      RETURNING *`,
      [
        employee_id,
        payment_period,
        amount_paid,
        payment_method || 'BANK_TRANSFER',
        deductions || 0,
        bonuses || 0,
        net_amount,
        req.user!.id,
        notes || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
}) as any);

// Update employee (full update)
router.put('/employees/:id', authenticate as any, requireAdmin as any, (async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      employee_name,
      position,
      phone,
      email,
      salary_amount,
      payment_frequency,
      bank_account,
      bank_name,
      branch_id,
    } = req.body;

    // Validate required fields
    if (!employee_name || !position || !phone || !salary_amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!PAYMENT_FREQUENCIES.includes(String(payment_frequency || '').toUpperCase())) {
      return res.status(400).json({ error: 'Payment frequency must be monthly, bi-weekly, weekly, or daily' });
    }

    const result = await query(
      `UPDATE payroll_employees 
       SET employee_name = $1, position = $2, phone = $3, email = $4,
           salary_amount = $5, payment_frequency = $6, bank_account = $7, bank_name = $8,
           branch_id = $9, updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [employee_name, position, phone, email, salary_amount, String(payment_frequency).toUpperCase(), bank_account, bank_name, branch_id ? Number(branch_id) : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
}) as any);

// Update employee status only
router.patch('/employees/:id/status', authenticate as any, requireAdmin as any, (async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { employment_status } = req.body;

    if (!employment_status) {
      return res.status(400).json({ error: 'Employment status is required' });
    }

    const result = await query(
      `UPDATE payroll_employees 
       SET employment_status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [employment_status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating employee status:', error);
    res.status(500).json({ error: 'Failed to update employee status' });
  }
}) as any);

// Delete employee
router.delete('/employees/:id', authenticate as any, requireAdmin as any, (async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if employee has any salary payments
    const paymentsCheck = await query(
      'SELECT COUNT(*) FROM salary_payments WHERE employee_id = $1',
      [id]
    );

    if (parseInt(paymentsCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete employee with existing salary payment history. Consider suspending instead.' 
      });
    }

    const result = await query(
      'DELETE FROM payroll_employees WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee deleted successfully', employee: result.rows[0] });
  } catch (error: any) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
}) as any);

// Update employee (change salary, status, etc.)
router.patch('/employees/:id', authenticate as any, requireAdmin as any, (async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      salary_amount,
      position,
      phone,
      email,
      employment_status,
      bank_account,
      bank_name
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (salary_amount !== undefined) {
      updates.push(`salary_amount = $${paramCount++}`);
      values.push(salary_amount);
    }
    if (position) {
      updates.push(`position = $${paramCount++}`);
      values.push(position);
    }
    if (phone) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (employment_status) {
      updates.push(`employment_status = $${paramCount++}`);
      values.push(employment_status);
    }
    if (bank_account !== undefined) {
      updates.push(`bank_account = $${paramCount++}`);
      values.push(bank_account);
    }
    if (bank_name !== undefined) {
      updates.push(`bank_name = $${paramCount++}`);
      values.push(bank_name);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE payroll_employees 
       SET ${updates.join(', ')} 
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
}) as any);

// Get payments for a specific employee
router.get('/employees/:id/payments', authenticate as any, requireAdmin as any, (async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `SELECT 
        sp.id,
        pe.employee_name,
        pe.position,
        sp.payment_date,
        sp.payment_period,
        sp.amount_paid,
        sp.deductions,
        sp.bonuses,
        sp.net_amount,
        sp.payment_method,
        sp.payment_status,
        sp.notes
       FROM salary_payments sp
       JOIN payroll_employees pe ON sp.employee_id = pe.id
       WHERE sp.employee_id = $1
       ORDER BY sp.payment_date DESC`,
      [id]
    );
    
    // Convert numeric fields from strings to numbers
    const payments = result.rows.map(row => ({
      ...row,
      amount_paid: parseFloat(row.amount_paid),
      deductions: parseFloat(row.deductions),
      bonuses: parseFloat(row.bonuses),
      net_amount: parseFloat(row.net_amount)
    }));
    
    res.json(payments);
  } catch (error: any) {
    console.error('Error fetching employee payments:', error);
    res.status(500).json({ error: 'Failed to fetch employee payments' });
  }
}) as any);

export default router;
