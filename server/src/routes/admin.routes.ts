import { Router, Request, Response, NextFunction } from 'express';
import { authGuard } from '../middlewares/authGuard.js';
import { getAdminUsers, patchAdminUserStatus } from '../controllers/admin.controller.js';

const router = Router();

function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: {
        code: 'ADMIN_ONLY_ENDPOINT',
        message: 'Administrator privileges are required to access this endpoint.'
      }
    });
    return;
  }
  next();
}

router.use(authGuard);
router.use(requireAdminRole);

router.get('/users', getAdminUsers);
router.patch('/users/:id/status', patchAdminUserStatus);

export default router;
