import { Request, Response, NextFunction } from 'express';
import {
  listPlatformUsers,
  updateUserAccessStatus,
  AdminError
} from '../services/admin.service.js';

export async function getAdminUsers(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const users = await listPlatformUsers();
    res.status(200).json({
      success: true,
      data: { users }
    });
  } catch (err) {
    next(err);
  }
}

export async function patchAdminUserStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    const user = await updateUserAccessStatus(adminId, req.params.id, req.body);
    res.status(200).json({
      success: true,
      data: { user }
    });
  } catch (err: any) {
    if (err instanceof AdminError) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details
        }
      });
      return;
    }
    next(err);
  }
}
