import { Router } from 'express';
import { authGuard } from '../middlewares/authGuard.js';
import { roleGuard } from '../middlewares/roleGuard.js';
import {
  getAccountById,
  updateAccount,
  deleteAccount,
  getTransactions,
  getSummary,
  createExpenseTransaction
} from '../controllers/mockFinancial.controller.js';

const router = Router();

// Financial routes require authentication and role check in sequence (authGuard -> roleGuard)
router.use(authGuard);
router.use(roleGuard);

router.get('/accounts/:id', getAccountById);
router.put('/accounts/:id', updateAccount);
router.delete('/accounts/:id', deleteAccount);
router.get('/transactions', getTransactions);
router.post('/transactions/expense', createExpenseTransaction);
router.get('/reports/summary', getSummary);

export default router;
