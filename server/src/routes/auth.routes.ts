import { Router } from 'express';
import { login, getCurrentUser, logout } from '../controllers/auth.controller.js';
import { authGuard } from '../middlewares/authGuard.js';

const router = Router();

router.post('/login', login);
router.get('/me', authGuard, getCurrentUser);
router.post('/logout', logout);

export default router;
