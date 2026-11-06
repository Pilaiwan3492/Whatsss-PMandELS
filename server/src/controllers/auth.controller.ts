import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { config } from '../config/env.js';

export async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body || {};

  if (!username || !password) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      }
    });
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: username },
        { email: username }
      ]
    }
  });

  if (!user || !user.is_active) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      }
    });
    return;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      }
    });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: config.isProduction
  });

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    }
  });
}

export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id }
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

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    }
  });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: config.isProduction,
    maxAge: 0
  });

  res.status(200).json({
    success: true,
    data: {
      message: 'Logged out successfully'
    }
  });
}
