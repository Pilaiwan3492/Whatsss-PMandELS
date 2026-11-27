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

export interface PlatformUserDirectoryEntry {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  is_active: boolean;
  created_at: string;
}

export interface PlatformUserStatusUpdateResult {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  is_active: boolean;
  updated_at: string;
}

/**
 * Lists all platform users with strictly contract-approved non-financial governance metadata
 * (F-19, FR-03, BR-10, NFR-SEC-01): id, username, email, role, is_active, created_at.
 * Never selects or returns password_hash, accounts, transactions, or financial summaries.
 */
export async function listPlatformUsers(
  prismaClient = defaultPrisma
): Promise<PlatformUserDirectoryEntry[]> {
  const users = await prismaClient.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      is_active: true,
      created_at: true
    },
    orderBy: { created_at: 'asc' }
  });

  return users.map((u: any) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    is_active: Boolean(u.is_active),
    created_at: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at)
  }));
}

/**
 * Toggles a user's is_active status (F-19, FR-04, AC-19-2, AC-19-4).
 * - Prevents an ADMIN from deactivating their own account (422 CANNOT_DEACTIVATE_SELF).
 * - Compatible Safeguard (Task 8): Prevents deactivating the last remaining active ADMIN
 *   account (422 CANNOT_DEACTIVATE_LAST_ADMIN) inside a serialized database transaction
 *   using SELECT ... FOR UPDATE on active ADMIN rows to prevent concurrent lockout races.
 */
export async function updateUserAccessStatus(
  adminUserId: string,
  targetUserId: string,
  input: { is_active?: unknown },
  prismaClient = defaultPrisma
): Promise<PlatformUserStatusUpdateResult> {
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

  const isDefaultRealClient = prismaClient === defaultPrisma;

  const executeUpdate = async (tx: any): Promise<PlatformUserStatusUpdateResult> => {
    // When deactivating, lock all active ADMIN rows in canonical ID order to prevent
    // concurrent admin deactivations from leaving the platform with zero active admins.
    if (input.is_active === false) {
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`
          SELECT id FROM "users"
          WHERE role = 'ADMIN'
            AND is_active = true
          ORDER BY id ASC
          FOR UPDATE
        `;
      } else if (isDefaultRealClient) {
        throw new AdminError(
          'Database row locking is unavailable for admin deactivation.',
          503,
          'ADMIN_LOCK_UNAVAILABLE'
        );
      }
    }

    const existing = await tx.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, is_active: true }
    });

    if (!existing) {
      throw new AdminError(`User [${targetUserId}] was not found.`, 404, 'NOT_FOUND');
    }

    if (input.is_active === false && existing.role === 'ADMIN' && existing.is_active === true) {
      let activeAdminCount = 0;
      if (typeof tx.user.count === 'function') {
        activeAdminCount = await tx.user.count({
          where: { role: 'ADMIN', is_active: true }
        });
      } else if (typeof tx.user.findMany === 'function') {
        const activeAdmins = await tx.user.findMany({
          where: { role: 'ADMIN', is_active: true },
          select: { id: true }
        });
        activeAdminCount = activeAdmins.filter((a: any) => a.role === 'ADMIN' ? a.is_active !== false : true).length;
      }

      if (activeAdminCount <= 1) {
        throw new AdminError(
          'Cannot deactivate the last active platform administrator.',
          422,
          'CANNOT_DEACTIVATE_LAST_ADMIN'
        );
      }
    }

    const updated: any = await tx.user.update({
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
  };

  if (typeof (prismaClient as any).$transaction === 'function') {
    return await (prismaClient as any).$transaction(executeUpdate);
  }
  if (isDefaultRealClient) {
    throw new AdminError(
      'Database transaction support is unavailable for admin access governance.',
      503,
      'ADMIN_TRANSACTION_UNAVAILABLE'
    );
  }
  return await executeUpdate(prismaClient);
}
