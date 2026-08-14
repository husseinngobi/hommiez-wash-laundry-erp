import { Response } from 'express';
import { validationResult } from 'express-validator';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { resolveWriteBranchId, resolveListBranchId } from '../utils/branchScope';
import { notifyAdministrators } from './notifications.controller';

/**
 * Record a new expense
 */
export const recordExpense = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      expense_date,
      category,
      description,
      amount,
      payment_method,
      receipt_number,
      branch_id: requestedBranchId,
    } = req.body;

    const userId = req.user?.id;
    const branchId = resolveWriteBranchId(req, requestedBranchId);

    const result = await query(
      `INSERT INTO expenses 
       (expense_date, category, description, amount, payment_method, receipt_number, submitted_by, status, created_at, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', NOW(), $8)
       RETURNING id, expense_date, description, amount, branch_id`,
      [expense_date || new Date(), category, description, amount, payment_method || 'CASH', receipt_number, userId, branchId]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, 'RECORD_EXPENSE', JSON.stringify({ expense_id: result.rows[0].id, amount, description })]
    );

    // Professional hierarchical notification system
    const creatorRole = req.user?.role;
    const creatorName = req.user?.full_name || 'Staff';
    
    if (creatorRole === 'DESKTOP_AGENT') {
      // Desktop Agent creates → Notify Manager AND Admin (both can approve)
      const approvers = await query(
        `SELECT id, full_name, role FROM users 
         WHERE role IN ('MANAGER', 'ADMIN') AND id != $1`,
        [userId]
      );

      for (const approver of approvers.rows) {
        await query(
          `INSERT INTO notifications (user_id, type, title, message, link, created_at)
           VALUES ($1, 'expense', 'Pending Expense Approval', $2, '/expenses', NOW())`,
          [
            approver.id,
            `${creatorName} (Desktop Agent) submitted an expense of UGX ${parseFloat(amount).toLocaleString()} for approval. ${description}`
          ]
        );
      }
    } else if (creatorRole === 'MANAGER') {
      // Manager creates → Notify Admin only (only Admin can approve)
      const admins = await query(
        `SELECT id FROM users WHERE role = 'ADMIN'`
      );

      for (const admin of admins.rows) {
        await query(
          `INSERT INTO notifications (user_id, type, title, message, link, created_at)
           VALUES ($1, 'expense', 'Pending Expense Approval', $2, '/expenses', NOW())`,
          [
            admin.id,
            `${creatorName} (Manager) submitted an expense of UGX ${parseFloat(amount).toLocaleString()} for approval. ${description}`
          ]
        );
      }
    } else if (creatorRole === 'ADMIN') {
      // Admin creates → Self-notification for tracking (can self-approve)
      await query(
        `INSERT INTO notifications (user_id, type, title, message, link, created_at)
         VALUES ($1, 'expense', 'Expense Pending Your Approval', $2, '/expenses', NOW())`,
        [
          userId,
          `Your expense of UGX ${parseFloat(amount).toLocaleString()} is pending approval. ${description}`
        ]
      );
    }

    res.status(201).json({
      message: 'Expense recorded successfully',
      expense: result.rows[0],
    });

  } catch (error) {
    console.error('Record expense error:', error);
    res.status(500).json({ error: 'Failed to record expense' });
  }
};

/**
 * Get all expenses with filters and pagination
 */
export const getAllExpenses = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      from_date,
      to_date,
      category_id,
      category,
      approval_status,
      status,
      search,
      branch_id,
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    // Build WHERE clause
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
    let paramCount = 1;

    const listBranchId = resolveListBranchId(req, branch_id);
    if (listBranchId) {
      whereClause += ` AND e.branch_id = $${paramCount++}`;
      values.push(listBranchId);
    }

    if (from_date) {
      whereClause += ` AND e.expense_date >= $${paramCount++}`;
      values.push(from_date);
    }

    if (to_date) {
      whereClause += ` AND e.expense_date <= $${paramCount++}`;
      values.push(to_date);
    }

    const categoryFilter = category || category_id;
    if (categoryFilter) {
      whereClause += ` AND e.category = $${paramCount++}`;
      values.push(categoryFilter);
    }

    const statusFilter = approval_status || status;
    if (statusFilter) {
      whereClause += ` AND e.status = $${paramCount++}`;
      values.push(statusFilter);
    }

    if (search) {
      whereClause += ` AND (e.description ILIKE $${paramCount} OR e.receipt_number ILIKE $${paramCount})`;
      values.push(`%${search}%`);
      paramCount++;
    }

    values.push(limit, offset);

    const result = await query(
      `SELECT 
        e.*,
        e.category as category_name,
        '#3B82F6' as category_color,
        u1.full_name as recorded_by_name,
        u2.full_name as approved_by_name,
        b.name as branch_name
       FROM expenses e
       LEFT JOIN users u1 ON e.submitted_by = u1.id
       LEFT JOIN users u2 ON e.approved_by = u2.id
       LEFT JOIN branches b ON e.branch_id = b.id
       ${whereClause}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount}`,
      values
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM expenses e ${whereClause}`,
      values.slice(0, -2)
    );

    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      expenses: result.rows,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
        totalCount,
        pageSize: Number(limit),
      },
    });

  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ error: 'Failed to get expenses' });
  }
};

/**
 * Get expense by ID
 */
export const getExpenseById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
        e.*,
        e.category as category_name,
        '#3B82F6' as category_color,
        u1.full_name as recorded_by_name,
        u1.email as recorded_by_email,
        u2.full_name as approved_by_name
       FROM expenses e
       LEFT JOIN users u1 ON e.submitted_by = u1.id
       LEFT JOIN users u2 ON e.approved_by = u2.id
       WHERE e.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Get expense by ID error:', error);
    res.status(500).json({ error: 'Failed to get expense' });
  }
};

/**
 * Update expense (only if not approved)
 */
export const updateExpense = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      expense_date,
      category,
      description,
      amount,
      payment_method,
      receipt_number,
    } = req.body;

    // Check if expense is already approved
    const expenseCheck = await query(
      'SELECT status FROM expenses WHERE id = $1',
      [id]
    );

    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (expenseCheck.rows[0].status === 'APPROVED') {
      return res.status(400).json({ error: 'Cannot edit approved expense' });
    }

    const result = await query(
      `UPDATE expenses 
       SET expense_date = $1, category = $2, description = $3, amount = $4, 
           payment_method = $5, receipt_number = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [expense_date, category, description, amount, payment_method, receipt_number, id]
    );

    res.json({
      message: 'Expense updated successfully',
      expense: result.rows[0],
    });

  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
};

/**
 * Approve/Reject expense (Admin only)
 */
export const approveExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { approval_status, approval_notes, rejection_reason } = req.body; // 'APPROVED' or 'REJECTED'

    if (!['APPROVED', 'REJECTED'].includes(approval_status)) {
      return res.status(400).json({ error: 'Invalid approval status' });
    }

    const userId = req.user?.id;
    const approverRole = req.user?.role;

    // Professional hierarchical approval permissions
    // First, get expense details to check creator's role
    const expenseCheck = await query(
      `SELECT e.*, u.role as creator_role, u.full_name as creator_name
       FROM expenses e
       JOIN users u ON e.submitted_by = u.id
       WHERE e.id = $1`,
      [id]
    );

    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const expenseToApprove = expenseCheck.rows[0];
    const creatorRole = expenseToApprove.creator_role;

    // Permission validation
    if (creatorRole === 'DESKTOP_AGENT') {
      // Desktop Agent expenses can be approved by Manager OR Admin
      if (!approverRole || !['MANAGER', 'ADMIN'].includes(approverRole)) {
        return res.status(403).json({ 
          error: 'Only Managers and Admins can approve Desktop Agent expenses' 
        });
      }
    } else if (creatorRole === 'MANAGER') {
      // Manager expenses can only be approved by Admin
      if (approverRole !== 'ADMIN') {
        return res.status(403).json({ 
          error: 'Only Admins can approve Manager expenses' 
        });
      }
    } else if (creatorRole === 'ADMIN') {
      // Admin expenses can be self-approved by any Admin
      if (approverRole !== 'ADMIN') {
        return res.status(403).json({ 
          error: 'Only Admins can approve Admin expenses' 
        });
      }
    }

    // Build update query based on approval status
    let updateQuery;
    let queryParams;
    
    if (approval_status === 'APPROVED') {
      updateQuery = `UPDATE expenses 
       SET status = $1, approved_by = $2, approved_at = NOW(), approval_notes = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`;
      queryParams = [approval_status, userId, approval_notes, id];
    } else {
      updateQuery = `UPDATE expenses 
       SET status = $1, rejected_by = $2, rejected_at = NOW(), rejection_reason = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`;
      queryParams = [approval_status, userId, rejection_reason, id];
    }

    const result = await query(updateQuery, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, 'APPROVE_EXPENSE', JSON.stringify({ expense_id: id, status: approval_status })]
    );

    // Notify the submitter about the approval/rejection (only if different person)
    const expense = result.rows[0];
    if (expense.submitted_by && expense.submitted_by !== userId) {
      // Get approver details for personalized notification
      const approverResult = await query(
        `SELECT full_name, role FROM users WHERE id = $1`,
        [userId]
      );
      const approverName = approverResult.rows[0]?.full_name || 'Administrator';
      const approverRole = approverResult.rows[0]?.role || 'ADMIN';
      
      let notificationTitle = '';
      let notificationMessage = '';
      
      if (approval_status === 'APPROVED') {
        notificationTitle = 'Expense Approved ✓';
        notificationMessage = `Your expense of UGX ${parseFloat(expense.amount).toLocaleString()} has been approved by ${approverName} (${approverRole}).`;
        
        if (approval_notes) {
          notificationMessage += `\n\nNotes: ${approval_notes}`;
        }
      } else {
        // Professional rejection notification with clear guidance
        notificationTitle = 'Expense Rejected';
        notificationMessage = `Your expense of UGX ${parseFloat(expense.amount).toLocaleString()} for "${expense.description}" has been rejected by ${approverName} (${approverRole}).\n\n`;
        
        if (rejection_reason) {
          notificationMessage += `Reason: ${rejection_reason}\n\n`;
        }
        
        notificationMessage += `Next Steps:\n`;
        notificationMessage += `• Contact ${approverName} to discuss this expense\n`;
        notificationMessage += `• If clarified, you may submit a new expense with updated details\n`;
        notificationMessage += `• Ensure all receipts and documentation are attached`;
      }

      await query(
        `INSERT INTO notifications (user_id, type, title, message, link, created_at)
         VALUES ($1, 'expense', $2, $3, '/expenses', NOW())`,
        [
          expense.submitted_by,
          notificationTitle,
          notificationMessage
        ]
      );
    }

    if (approverRole === 'MANAGER') {
      await notifyAdministrators(
        'expense',
        `Expense ${approval_status.toLowerCase()} by manager`,
        `${req.user?.full_name} ${approval_status.toLowerCase()} an expense of UGX ${parseFloat(expense.amount).toLocaleString()} (${expense.description}).`,
        '/expenses'
      );
    }

    res.json({
      message: `Expense ${approval_status.toLowerCase()} successfully`,
      expense: result.rows[0],
    });

  } catch (error) {
    console.error('Approve expense error:', error);
    res.status(500).json({ error: 'Failed to approve expense' });
  }
};

/**
 * Delete expense (only if not approved)
 */
export const deleteExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if expense is already approved
    const expenseCheck = await query(
      'SELECT status FROM expenses WHERE id = $1',
      [id]
    );

    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (expenseCheck.rows[0].status === 'APPROVED') {
      return res.status(400).json({ error: 'Cannot delete approved expense' });
    }

    await query('DELETE FROM expenses WHERE id = $1', [id]);

    res.json({ message: 'Expense deleted successfully' });

  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
};

/**
 * Get expense categories
 */
export const getExpenseCategories = async (req: AuthRequest, res: Response) => {
  try {
    // Return predefined categories since we're not using a separate table
    const categories = [
      { id: 1, name: 'Utilities', color: '#3B82F6', is_active: true },
      { id: 2, name: 'Supplies', color: '#10B981', is_active: true },
      { id: 3, name: 'Maintenance', color: '#F59E0B', is_active: true },
      { id: 4, name: 'Transport', color: '#8B5CF6', is_active: true },
      { id: 5, name: 'Office', color: '#EF4444', is_active: true },
      { id: 6, name: 'Other', color: '#6B7280', is_active: true },
    ];

    res.json(categories);

  } catch (error) {
    console.error('Get expense categories error:', error);
    res.status(500).json({ error: 'Failed to get expense categories' });
  }
};

/**
 * Get expense statistics/summary
 */
export const getExpenseStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const { from_date, to_date } = req.query;

    let dateFilter = '';
    const values: any[] = [];

    if (from_date && to_date) {
      dateFilter = 'WHERE expense_date BETWEEN $1 AND $2';
      values.push(from_date, to_date);
    } else {
      // Default to current month
      dateFilter = `WHERE DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)`;
    }

    // Total expenses
    const totalResult = await query(
      `SELECT 
        COALESCE(SUM(amount), 0) as total_expenses,
        COUNT(*) as total_count
       FROM expenses 
       ${dateFilter} AND status = 'APPROVED'`,
      values
    );

    // By category
    const categoryResult = await query(
      `SELECT 
        e.category,
        '#3B82F6' as color,
        COALESCE(SUM(e.amount), 0) as amount,
        COUNT(e.id) as count
       FROM expenses e
       WHERE e.status = 'APPROVED' 
         ${dateFilter.replace('WHERE', 'AND')}
       GROUP BY e.category
       HAVING COALESCE(SUM(e.amount), 0) > 0
       ORDER BY amount DESC`,
      values
    );

    // Pending approvals
    const pendingResult = await query(
      `SELECT COUNT(*) as pending_count, COALESCE(SUM(amount), 0) as pending_amount
       FROM expenses 
       WHERE status = 'PENDING'`
    );

    res.json({
      total: totalResult.rows[0],
      byCategory: categoryResult.rows,
      pending: pendingResult.rows[0],
    });

  } catch (error) {
    console.error('Get expense statistics error:', error);
    res.status(500).json({ error: 'Failed to get expense statistics' });
  }
};
