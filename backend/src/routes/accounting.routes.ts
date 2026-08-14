import { Router } from 'express';
import {
  getIncomeStatement,
  getBalanceSheet,
  getCashFlowStatement,
  getTrialBalance,
  getAgedReceivables,
  getFinancialRatios,
  getBranchSummary,
} from '../controllers/accounting.controller';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/accounting/income-statement
 * @desc    Get Income Statement (P&L)
 * @access  Admin only
 */
router.get('/income-statement', authenticate as any, requireAdmin as any, getIncomeStatement as any);

/**
 * @route   GET /api/accounting/balance-sheet
 * @desc    Get Balance Sheet
 * @access  Admin only
 */
router.get('/balance-sheet', authenticate as any, requireAdmin as any, getBalanceSheet as any);

/**
 * @route   GET /api/accounting/cash-flow
 * @desc    Get Cash Flow Statement
 * @access  Admin only
 */
router.get('/cash-flow', authenticate as any, requireAdmin as any, getCashFlowStatement as any);

/**
 * @route   GET /api/accounting/trial-balance
 * @desc    Get Trial Balance
 * @access  Admin only
 */
router.get('/trial-balance', authenticate as any, requireAdmin as any, getTrialBalance as any);

/**
 * @route   GET /api/accounting/aged-receivables
 * @desc    Get Aged Receivables Report
 * @access  Admin only
 */
router.get('/aged-receivables', authenticate as any, requireAdmin as any, getAgedReceivables as any);

/**
 * @route   GET /api/accounting/financial-ratios
 * @desc    Get Financial Ratios
 * @access  Admin only
 */
router.get('/financial-ratios', authenticate as any, requireAdmin as any, getFinancialRatios as any);

router.get('/branch-summary', authenticate as any, requireAdmin as any, getBranchSummary as any);

export default router;
