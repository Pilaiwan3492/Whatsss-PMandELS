import { Router } from 'express';
import { authGuard } from '../middlewares/authGuard.js';
import { roleGuard } from '../middlewares/roleGuard.js';
import { createIncomeTransaction } from '../controllers/transaction.controller.js';

const router = Router();

// All transaction routes enforce session authentication and non-admin role boundary
router.use(authGuard);
router.use(roleGuard);

router.post('/income', createIncomeTransaction);

export default router;
