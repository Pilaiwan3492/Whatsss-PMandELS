import { Router } from 'express';
import { authGuard } from '../middlewares/authGuard.js';
import { roleGuard } from '../middlewares/roleGuard.js';
import {
  getTransactions,
} from '../controllers/mockFinancial.controller.js';
import { getSummary } from '../controllers/report.controller.js';

const router = Router();

// Financial routes require authentication and role check in sequence (authGuard -> roleGuard)
router.use(authGuard);
router.use(roleGuard);

router.get('/transactions', getTransactions);
router.get('/reports/summary', getSummary);

export default router;
