import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export interface WP06FixtureAccounts {
  checkingBank: { id: string; name: string; type: 'CASH'; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
  creditCard: { id: string; name: string; type: 'LOAN_TAKEN'; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
  salary: { id: string; name: string; type: 'INCOME'; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
  dining: { id: string; name: string; type: 'EXPENSE'; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
  grocery: { id: string; name: string; type: 'EXPENSE'; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
}

export interface WP06TestFixture {
  user: {
    id: string;
    username: string;
    email: string;
    rawPassword: string;
    role: 'USER';
  };
  accounts: WP06FixtureAccounts;
  createdTxnIds: string[];
  trackTxnId: (id: string) => void;
  cleanup: () => Promise<void>;
}

export interface DemoUserSnapshot {
  userFound: boolean;
  username: string;
  transactionCount: number;
  accounts: Array<{
    id: string;
    name: string;
    opening_balance: string;
    is_opening_locked: boolean;
  }>;
}

/**
 * Captures an immutable snapshot of user_demo accounts and transactions before tests run.
 * Used to assert that user_demo was 100% untouched and preserved during test execution.
 */
export async function captureDemoUserSnapshot(prisma: PrismaClient): Promise<DemoUserSnapshot> {
  const user = await prisma.user.findUnique({
    where: { username: 'user_demo' },
    include: {
      accounts: {
        orderBy: { name: 'asc' }
      },
      transactions: {
        select: { id: true }
      }
    }
  });

  if (!user) {
    return {
      userFound: false,
      username: 'user_demo',
      transactionCount: 0,
      accounts: []
    };
  }

  return {
    userFound: true,
    username: user.username,
    transactionCount: user.transactions.length,
    accounts: user.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      opening_balance: a.opening_balance.toFixed(2),
      is_opening_locked: a.is_opening_locked
    }))
  };
}

/**
 * Asserts that the current user_demo state matches the pre-test snapshot exactly.
 */
export async function assertDemoUserUnmodified(
  prisma: PrismaClient,
  baseline: DemoUserSnapshot
): Promise<void> {
  if (!baseline.userFound) {
    return;
  }

  const current = await captureDemoUserSnapshot(prisma);

  if (current.transactionCount !== baseline.transactionCount) {
    throw new Error(
      `DATA ISOLATION VIOLATION: user_demo transaction count changed from ${baseline.transactionCount} to ${current.transactionCount}`
    );
  }

  for (const baseAcc of baseline.accounts) {
    const curAcc = current.accounts.find((a) => a.id === baseAcc.id);
    if (!curAcc) {
      throw new Error(`DATA ISOLATION VIOLATION: user_demo account ${baseAcc.name} was removed`);
    }
    if (curAcc.opening_balance !== baseAcc.opening_balance) {
      throw new Error(
        `DATA ISOLATION VIOLATION: user_demo account ${baseAcc.name} opening_balance altered from ${baseAcc.opening_balance} to ${curAcc.opening_balance}`
      );
    }
    if (curAcc.is_opening_locked !== baseAcc.is_opening_locked) {
      throw new Error(
        `DATA ISOLATION VIOLATION: user_demo account ${baseAcc.name} lock flag changed from ${baseAcc.is_opening_locked} to ${curAcc.is_opening_locked}`
      );
    }
  }
}

/**
 * Provisions a completely isolated Test User and 5 standard Financial Accounts for WP-06.
 * Zero dependency on user_demo; each test run receives a globally unique test tenant.
 */
export async function createWP06TestFixture(
  prisma: PrismaClient,
  prefix = 'wp06'
): Promise<WP06TestFixture> {
  const uniqueToken = `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const username = `test_u_${uniqueToken}`;
  const email = `${username}@whatsss.test`;
  const rawPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // 1. Create Test User
  const user = await prisma.user.create({
    data: {
      username,
      email,
      password_hash: passwordHash,
      role: 'USER',
      is_active: true
    }
  });

  // 2. Create the 5 required standard accounts
  const checkingBank = await prisma.account.create({
    data: {
      user_id: user.id,
      name: 'Checking Bank',
      type: 'CASH',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false
    }
  });

  const creditCard = await prisma.account.create({
    data: {
      user_id: user.id,
      name: 'Visa Credit Card',
      type: 'LOAN_TAKEN',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false
    }
  });

  const salary = await prisma.account.create({
    data: {
      user_id: user.id,
      name: 'Salary',
      type: 'INCOME',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false
    }
  });

  const dining = await prisma.account.create({
    data: {
      user_id: user.id,
      name: 'Dining',
      type: 'EXPENSE',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false
    }
  });

  const grocery = await prisma.account.create({
    data: {
      user_id: user.id,
      name: 'Grocery',
      type: 'EXPENSE',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false
    }
  });

  const createdTxnIds: string[] = [];

  function trackTxnId(id: string) {
    if (id && !createdTxnIds.includes(id)) {
      createdTxnIds.push(id);
    }
  }

  /**
   * Deterministic teardown in strict reverse dependency order:
   * 1. Allocation Lines
   * 2. Transactions
   * 3. Accounts
   * 4. Test User
   * Uses an atomic Prisma transaction to guarantee 100% clean isolation.
   */
  async function cleanup(): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Delete all allocation lines of transactions tied to this test user
        await tx.allocationLine.deleteMany({
          where: {
            OR: [
              { transaction_id: { in: createdTxnIds } },
              { transaction: { user_id: user.id } },
              { target_account: { user_id: user.id } }
            ]
          }
        });

        // Step 2: Delete all transactions created by this test user
        await tx.transaction.deleteMany({
          where: {
            OR: [
              { id: { in: createdTxnIds } },
              { user_id: user.id }
            ]
          }
        });

        // Step 3: Delete all 5 test accounts
        await tx.account.deleteMany({
          where: { user_id: user.id }
        });

        // Step 4: Delete the test user record
        await tx.user.delete({
          where: { id: user.id }
        });
      });
    } catch (err: any) {
      console.error(`[WP06 TEARDOWN FAILURE] Could not clean up fixture for ${username}: ${err?.message || err}`);
      throw err;
    }
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      rawPassword,
      role: 'USER'
    },
    accounts: {
      checkingBank: {
        id: checkingBank.id,
        name: checkingBank.name,
        type: 'CASH',
        opening_balance: checkingBank.opening_balance,
        is_opening_locked: checkingBank.is_opening_locked
      },
      creditCard: {
        id: creditCard.id,
        name: creditCard.name,
        type: 'LOAN_TAKEN',
        opening_balance: creditCard.opening_balance,
        is_opening_locked: creditCard.is_opening_locked
      },
      salary: {
        id: salary.id,
        name: salary.name,
        type: 'INCOME',
        opening_balance: salary.opening_balance,
        is_opening_locked: salary.is_opening_locked
      },
      dining: {
        id: dining.id,
        name: dining.name,
        type: 'EXPENSE',
        opening_balance: dining.opening_balance,
        is_opening_locked: dining.is_opening_locked
      },
      grocery: {
        id: grocery.id,
        name: grocery.name,
        type: 'EXPENSE',
        opening_balance: grocery.opening_balance,
        is_opening_locked: grocery.is_opening_locked
      }
    },
    createdTxnIds,
    trackTxnId,
    cleanup
  };
}
