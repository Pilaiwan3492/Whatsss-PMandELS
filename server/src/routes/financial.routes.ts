import { Router } from 'express';
import { authGuard } from '../middlewares/authGuard.js';
import { roleGuard } from '../middlewares/roleGuard.js';
import { getAccountById, getTransactions, getSummary } from '../controllers/mockFinancial.controller.js';

const router = Router();

// Financial routes require authentication and role check
router.use(authGuard);
router.use(roleGuard);

router.get('/accounts/:id', getAccountById);
router.get('/transactions', getTransactions);
router.get('/reports/summary', getSummary);

export default router;
