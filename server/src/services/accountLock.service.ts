import { Prisma } from '@prisma/client';

/**
 * Service to atomically lock opening balance on accounts upon committing referencing transactions.
 * In accordance with F-03, FR-05, and BR-01:
 * - Accounts are permanently locked from opening balance modifications once referenced.
 * - Lock updates are scoped strictly by authenticated user_id.
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

  await tx.account.updateMany({
    where: {
      id: { in: uniqueIds },
      user_id: userId,
      is_opening_locked: false
    },
    data: {
      is_opening_locked: true,
      updated_at: new Date()
    }
  });
}
