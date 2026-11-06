import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { prisma } from '../prisma.js';
import { Role } from '../types/express.js';

interface JwtPayload {
  userId: string;
  username: string;
  role: Role;
}

export async function authGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
    return;
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
    return;
  }

  try {
    // Verify user existence and active status against current database state
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user || !user.is_active) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    // Bind current user identity and current database role (never trust stale JWT role)
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as Role
    };

    next();
  } catch (error) {
    next(error);
  }
}
