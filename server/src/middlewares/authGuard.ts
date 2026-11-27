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
    // Verify user existence and active status against current database state (fail-closed per F-19 / AC-19-3)
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        is_active: true
      }
    });

    if (!user) {
      res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: config.isProduction,
        maxAge: 0
      });
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'This user account has been disabled by an administrator.'
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
  } catch {
    // Fail-closed: never fall back to trusting stateless JWT claims when DB state is unverifiable
    res.status(503).json({
      success: false,
      error: {
        code: 'AUTH_STATE_UNVERIFIABLE',
        message: 'Authentication state cannot be verified due to a database error.'
      }
    });
  }
}
