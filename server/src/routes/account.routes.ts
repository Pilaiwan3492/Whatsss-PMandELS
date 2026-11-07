import { Router } from 'express';
import { authGuard } from '../middlewares/authGuard.js';
import { roleGuard } from '../middlewares/roleGuard.js';
import {
  getAccounts,
  getAccountById,
  updateOpeningBalance
} from '../controllers/account.controller.js';

const router = Router();

// Financial account routes require authentication and role check (authGuard -> roleGuard)
router.use(authGuard);
router.use(roleGuard);

router.get('/', getAccounts);
router.get('/:id', getAccountById);
router.patch('/:id/opening-balance', updateOpeningBalance);

export default router;
