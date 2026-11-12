import { Router } from 'express';
import { authGuard } from '../middlewares/authGuard.js';
import { roleGuard } from '../middlewares/roleGuard.js';
import { getTransactions } from '../controllers/transaction.controller.js';
import { getSummary } from '../controllers/report.controller.js';

const router = Router();

// Financial routes require authentication and role check in sequence (authGuard -> roleGuard)
router.get('/transactions', authGuard, roleGuard, getTransactions);
router.get('/reports/summary', authGuard, roleGuard, getSummary);

export default router;
