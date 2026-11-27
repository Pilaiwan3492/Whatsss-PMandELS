import { prisma as defaultPrisma } from '../prisma.js';

export class AdminError extends Error {
  statusCode: number;
  code: string;
  details: any[];

  constructor(
    message: string,
    statusCode: number = 400,
    code: string = 'BAD_REQUEST',
    details: any[] = []
  ) {
    super(message);
    this.name = 'AdminError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Lists all platform users with strictly non-financial governance metadata (F-19, FR-03, BR-10, NFR-SEC-01).
 * Never selects or returns password_hash, accounts, transactions, or financial summaries.
 */
export async function listPlatformUsers(prismaClient = defaultPrisma) {
  const users = await prismaClient.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      is_active: true,
      created_at: true,
      updated_at: true
    },
    orderBy: { created_at: 'asc' }
  });

  return users.map((u: any) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    is_active: Boolean(u.is_active),
    created_at: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at),
    updated_at: u.updated_at instanceof Date ? u.updated_at.toISOString() : String(u.updated_at)
  }));
}

/**
 * Toggles a user's is_active status (F-19, FR-04, AC-19-2, AC-19-4).
 * Prevents an ADMIN from deactivating their own account (422 CANNOT_DEACTIVATE_SELF).
 */
export async function updateUserAccessStatus(
  adminUserId: string,
  targetUserId: string,
  input: { is_active?: unknown },
  prismaClient = defaultPrisma
) {
  if (!input || typeof input !== 'object' || typeof input.is_active !== 'boolean') {
    throw new AdminError(
      'Field is_active must be a boolean (true or false).',
      400,
      'INVALID_STATUS_PAYLOAD'
    );
  }

  if (adminUserId === targetUserId && input.is_active === false) {
    throw new AdminError(
      'Administrators cannot deactivate their own active account.',
      422,
      'CANNOT_DEACTIVATE_SELF'
    );
  }

  const existing = await prismaClient.user.findUnique({
    where: { id: targetUserId },
    select: { id: true }
  });

  if (!existing) {
    throw new AdminError(`User [${targetUserId}] was not found.`, 404, 'NOT_FOUND');
  }

  const updated: any = await prismaClient.user.update({
    where: { id: targetUserId },
    data: { is_active: input.is_active },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      is_active: true,
      updated_at: true
    }
  });

  return {
    id: updated.id,
    username: updated.username,
    email: updated.email,
    role: updated.role,
    is_active: Boolean(updated.is_active),
    updated_at:
      updated.updated_at instanceof Date ? updated.updated_at.toISOString() : String(updated.updated_at)
  };
}
