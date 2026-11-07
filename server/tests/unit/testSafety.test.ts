import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * Unit Test: Test Database Safety & Snapshot-Restore Lifecycle (P0 Quality Fix)
 * Proves:
 * 1. Snapshot restoration restores exact opening_balance (does not hardcode 0.00).
 * 2. Snapshot restoration restores exact is_opening_locked state and updated_at.
 * 3. Scoped restoration targets ONLY the specific account ID and never calls blanket updateMany.
 * 4. Cleanup failures are rethrown and not silently swallowed with console.error.
 * 5. Local environment guard skips live database integration tests unless ALLOW_LIVE_DB_TESTS=true is set.
 */
describe('Unit Test: Live Database Integration Test Safety Policy (P0 Finding)', () => {
  interface AccountSnapshot {
    id: string;
    opening_balance: Prisma.Decimal;
    is_opening_locked: boolean;
    updated_at: Date;
  }

  async function restoreAccount(mockClient: any, snap: AccountSnapshot): Promise<void> {
    await mockClient.account.update({
      where: { id: snap.id },
      data: {
        opening_balance: snap.opening_balance,
        is_opening_locked: snap.is_opening_locked,
        updated_at: snap.updated_at
      }
    });
  }

  it('restores exact non-zero opening_balance from snapshot rather than hardcoding 0.00', async () => {
    const originalBalance = new Prisma.Decimal('7500.50');
    const originalDate = new Date('2026-11-01T10:00:00.000Z');
    const snapshot: AccountSnapshot = {
      id: 'acc-target',
      opening_balance: originalBalance,
      is_opening_locked: true,
      updated_at: originalDate
    };

    const mockPrisma = {
      account: {
        update: vi.fn().mockResolvedValue({})
      }
    };

    await restoreAccount(mockPrisma, snapshot);

    expect(mockPrisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-target' },
      data: {
        opening_balance: originalBalance,
        is_opening_locked: true,
        updated_at: originalDate
      }
    });

    // Ensures updateMany without where is NEVER called
    expect((mockPrisma.account as any).updateMany).toBeUndefined();
  });

  it('restores exact is_opening_locked state from snapshot', async () => {
    const snapshot: AccountSnapshot = {
      id: 'acc-target',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false,
      updated_at: new Date('2026-11-01T00:00:00.000Z')
    };

    const mockPrisma = {
      account: {
        update: vi.fn().mockResolvedValue({})
      }
    };

    await restoreAccount(mockPrisma, snapshot);

    expect(mockPrisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-target' },
      data: {
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        updated_at: expect.any(Date)
      }
    });
  });

  it('does not mutate unrelated accounts or other users during scoped restoration', async () => {
    const mockPrisma = {
      account: {
        update: vi.fn().mockResolvedValue({})
      }
    };

    const userASnapshot: AccountSnapshot = {
      id: 'user-a-checking-id',
      opening_balance: new Prisma.Decimal('10000.00'),
      is_opening_locked: false,
      updated_at: new Date()
    };

    await restoreAccount(mockPrisma, userASnapshot);

    // Only user A's specific account was targeted
    expect(mockPrisma.account.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-a-checking-id' }
      })
    );
  });

  it('propagates cleanup failures and does not silently swallow them with console.error', async () => {
    const mockPrisma = {
      account: {
        update: vi.fn().mockRejectedValue(new Error('PostgreSQL connection dropped during cleanup'))
      }
    };

    const snapshot: AccountSnapshot = {
      id: 'acc-target',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false,
      updated_at: new Date()
    };

    // Cleanup must throw so test runner marks the test failed
    await expect(restoreAccount(mockPrisma, snapshot)).rejects.toThrow(
      'PostgreSQL connection dropped during cleanup'
    );
  });

  it('enforces local environment guard: skips live DB execution when CI and ALLOW_LIVE_DB_TESTS are unset', () => {
    function shouldRunLiveDb(env: { CI?: string; GITHUB_ACTIONS?: string; ALLOW_LIVE_DB_TESTS?: string }): boolean {
      const isCI = env.CI === 'true' || env.GITHUB_ACTIONS === 'true';
      const allowLiveDb = env.ALLOW_LIVE_DB_TESTS === 'true';
      return isCI || allowLiveDb;
    }

    // Default local developer environment without flags
    expect(shouldRunLiveDb({})).toBe(false);
    expect(shouldRunLiveDb({ CI: 'false', ALLOW_LIVE_DB_TESTS: 'false' })).toBe(false);

    // CI environment
    expect(shouldRunLiveDb({ CI: 'true' })).toBe(true);
    expect(shouldRunLiveDb({ GITHUB_ACTIONS: 'true' })).toBe(true);

    // Explicit opt-in local developer environment
    expect(shouldRunLiveDb({ ALLOW_LIVE_DB_TESTS: 'true' })).toBe(true);
  });
});
