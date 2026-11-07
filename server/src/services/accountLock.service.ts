import { Prisma } from '@prisma/client';

export class AccountLockError extends Error {
  code: string;
  constructor(message: string, code: string = 'ACCOUNT_LOCK_FAILED') {
    super(message);
    this.name = 'AccountLockError';
    this.code = code;
  }
}

/**
 * Service to atomically lock opening balance on accounts upon committing referencing transactions.
 * In accordance with F-03, FR-05, and BR-01:
 * - Accounts are permanently locked from opening balance modifications once referenced.
 * - Deduplicates account IDs.
 * - Verifies every requested ID exists and belongs to the supplied user inside the transaction boundary.
 * - If any ID is missing or belongs to another user, throws an error to abort the entire transaction.
 * - Never silently locks only a partial subset.
 */
export async function lockAccounts(
  tx: Prisma.TransactionClient,
  accountIds: string[],
  userId: string
): Promise<void> {
  const uniqueIds = Array.from(new Set(accountIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return;
  }

  // Find all matching accounts belonging to the user inside the transaction
  const accounts = await tx.account.findMany({
    where: {
      id: { in: uniqueIds },
      user_id: userId
    },
    select: {
      id: true,
      is_opening_locked: true
    }
  });

  // Verify that every requested unique ID exists and belongs strictly to this user
  if (accounts.length !== uniqueIds.length) {
    const foundIds = new Set(accounts.map((a) => a.id));
    const missingOrForeignIds = uniqueIds.filter((id) => !foundIds.has(id));
    throw new AccountLockError(
      `Cannot lock accounts: account(s) [${missingOrForeignIds.join(', ')}] not found or not owned by user.`,
      'ACCOUNT_LOCK_FAILED'
    );
  }

  // Filter only those accounts that are not already locked to avoid redundant database writes
  const accountsToLock = accounts.filter((a) => !a.is_opening_locked).map((a) => a.id);
  if (accountsToLock.length === 0) {
    return;
  }

  await tx.account.updateMany({
    where: {
      id: { in: accountsToLock },
      user_id: userId,
      is_opening_locked: false
    },
    data: {
      is_opening_locked: true,
      updated_at: new Date()
    }
  });
}
