import { Router } from 'express';
import { authGuard } from '../middlewares/authGuard.js';
import { roleGuard } from '../middlewares/roleGuard.js';
import {
  getTransactions,
  createIncomeTransaction,
  createExpenseTransaction,
  createRepaymentTransaction
} from '../controllers/transaction.controller.js';

const router = Router();

// All transaction routes enforce session authentication and non-admin role boundary
router.use(authGuard);
router.use(roleGuard);

router.get('/', getTransactions);
router.post('/income', createIncomeTransaction);
router.post('/expense', createExpenseTransaction);
router.post('/repayment', createRepaymentTransaction);

export default router;
