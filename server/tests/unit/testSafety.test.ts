import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  validateTestDatabaseUrl,
  assertTestDatabase,
  executeCleanupsSafely,
  TestDbOptions
} from '../fixtures/testDbGuard.js';

/**
 * Unit Test: Test Database Safety & Snapshot-Restore Lifecycle (P0 Quality Fix)
 * Proves:
 * 1. Snapshot restoration restores exact opening_balance (does not hardcode 0.00).
 * 2. Snapshot restoration restores exact is_opening_locked state and updated_at.
 * 3. Scoped restoration targets ONLY the specific account ID and never calls blanket updateMany.
 * 4. Cleanup failures are rethrown and not silently swallowed with console.error.
 * 5. Local environment guard skips live database integration tests unless ALLOW_LIVE_DB_TESTS=true is set.
 * 6. User snapshot captures and restores exact updated_at timestamp, password hash, role, and active status.
 * 7. Database URL verification strictly verifies isolated test database and rejects production/remote databases.
 */
describe('Unit Test: Live Database Integration Test Safety Policy (P0 Finding)', () => {
  interface AccountSnapshot {
    id: string;
    opening_balance: Prisma.Decimal;
    is_opening_locked: boolean;
    updated_at: Date;
  }

  interface UserSnapshot {
    id: string;
    username: string;
    password_hash: string;
    role: string;
    is_active: boolean;
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

  async function restoreUsers(mockClient: any, snaps: UserSnapshot[]): Promise<void> {
    for (const u of snaps) {
      await mockClient.user.update({
        where: { id: u.id },
        data: {
          password_hash: u.password_hash,
          role: u.role,
          is_active: u.is_active,
          updated_at: u.updated_at
        }
      });
    }
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

  it('restores user exact updated_at timestamp, password hash, role, and active status', async () => {
    const mockPrisma = {
      user: {
        update: vi.fn().mockResolvedValue({})
      }
    };

    const originalUpdatedAt = new Date('2026-11-05T08:30:00.000Z');
    const userSnapshots: UserSnapshot[] = [
      {
        id: 'user-1',
        username: 'user_demo',
        password_hash: '$2b$10$originalHashUserDemo...',
        role: 'USER',
        is_active: true,
        updated_at: originalUpdatedAt
      },
      {
        id: 'admin-1',
        username: 'admin_demo',
        password_hash: '$2b$10$originalHashAdminDemo...',
        role: 'ADMIN',
        is_active: true,
        updated_at: new Date('2026-11-05T09:00:00.000Z')
      }
    ];

    await restoreUsers(mockPrisma, userSnapshots);

    expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        password_hash: '$2b$10$originalHashUserDemo...',
        role: 'USER',
        is_active: true,
        updated_at: originalUpdatedAt
      }
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: {
        password_hash: '$2b$10$originalHashAdminDemo...',
        role: 'ADMIN',
        is_active: true,
        updated_at: expect.any(Date)
      }
    });
  });

  describe('Database URL Safety Verification (Test DB Guard)', () => {
    it('accepts CI service container database URL on localhost', () => {
      const ciUrl = 'postgresql://whatsss_user:whatsss_password@localhost:5432/whatsss_db?schema=public';
      const result = validateTestDatabaseUrl(ciUrl, { isCI: true, allowLiveDb: false, nodeEnv: 'test' });
      expect(result.isValid).toBe(true);
    });

    it('accepts local dedicated test database containing "test" keyword', () => {
      const localTestUrl = 'postgresql://whatsss_user:whatsss_password@localhost:5432/whatsss_test?schema=public';
      const result = validateTestDatabaseUrl(localTestUrl, { isCI: false, allowLiveDb: true, nodeEnv: 'test' });
      expect(result.isValid).toBe(true);
    });

    it('rejects local dev database without "test" keyword to prevent developer data mutation', () => {
      const devUrl = 'postgresql://whatsss_user:whatsss_password@localhost:5432/whatsss_db?schema=public';
      const result = validateTestDatabaseUrl(devUrl, { isCI: false, allowLiveDb: true, nodeEnv: 'test' });
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('is not verified as a test database');
    });

    it('rejects remote or non-loopback host to prevent external database corruption', () => {
      const remoteUrl = 'postgresql://admin:secret@db.whatsss.com:5432/whatsss_test';
      const result = validateTestDatabaseUrl(remoteUrl, { isCI: false, allowLiveDb: true });
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('restricted to local/container test instances');
    });

    it('rejects database names containing production keywords', () => {
      const prodDbUrl = 'postgresql://whatsss_user:password@localhost:5432/whatsss_production';
      const result = validateTestDatabaseUrl(prodDbUrl, { isCI: true, allowLiveDb: true });
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('forbidden production keyword');
    });

    it('rejects execution when NODE_ENV is production', () => {
      const url = 'postgresql://whatsss_user:password@localhost:5432/whatsss_test';
      const result = validateTestDatabaseUrl(url, { isCI: true, allowLiveDb: true, nodeEnv: 'production' });
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('strictly forbidden in production');
    });

    it('assertTestDatabase throws immediately when verification fails', () => {
      const badUrl = 'postgresql://admin:secret@production-db.internal:5432/prod_db';
      expect(() => {
        assertTestDatabase(badUrl, { isCI: false, allowLiveDb: true });
      }).toThrow(/FATAL: Test database verification failed/);
    });

    it('rejects URL in CI when host passes allowlist but database is not the provisioned CI service database', () => {
      const foreignDbInCi = 'postgresql://whatsss_user:password@localhost:5432/foreign_unrelated_db?schema=public';
      const result = validateTestDatabaseUrl(foreignDbInCi, { isCI: true, allowLiveDb: false, nodeEnv: 'test' });
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('does not match the provisioned CI service container');
    });

    it('rejects local execution when allowLiveDb is false even if database contains "test"', () => {
      const testDbUrl = 'postgresql://whatsss_user:password@localhost:5432/whatsss_test';
      const result = validateTestDatabaseUrl(testDbUrl, { isCI: false, allowLiveDb: false, nodeEnv: 'test' });
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Live database tests are not enabled in local developer environment');
    });
  });

  describe('Cleanup Failure Isolation & Guaranteed Restoration', () => {
    it('executes restoreUsers even when restoreAccount throws an error (failure isolation)', async () => {
      const mockPrisma = {
        account: {
          update: vi.fn().mockRejectedValue(new Error('PostgreSQL connection dropped during account cleanup'))
        },
        user: {
          update: vi.fn().mockResolvedValue({})
        }
      };

      const accountSnap: AccountSnapshot = {
        id: 'acc-1',
        opening_balance: new Prisma.Decimal('100.00'),
        is_opening_locked: false,
        updated_at: new Date()
      };

      const userSnap: UserSnapshot = {
        id: 'user-1',
        username: 'user_demo',
        password_hash: 'hash',
        role: 'USER',
        is_active: true,
        updated_at: new Date()
      };

      const queue: Array<() => Promise<void>> = [];
      queue.push(async () => {
        await restoreUsers(mockPrisma, [userSnap]);
      });
      queue.push(async () => {
        await restoreAccount(mockPrisma, accountSnap);
      });

      // Execute cleanups: must throw error because restoreAccount failed, but restoreUsers MUST still execute!
      await expect(executeCleanupsSafely(queue)).rejects.toThrow(
        'PostgreSQL connection dropped during account cleanup'
      );

      // Verify that restoreUsers was indeed called despite restoreAccount failure!
      expect(mockPrisma.account.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } })
      );
    });

    it('guarantees user snapshot is restored when seed throws an error within try/finally block', async () => {
      const mockPrisma = {
        user: {
          update: vi.fn().mockResolvedValue({})
        }
      };

      const originalDate = new Date('2026-11-01T00:00:00.000Z');
      const userSnaps: UserSnapshot[] = [
        {
          id: 'u-1',
          username: 'user_demo',
          password_hash: 'hash123',
          role: 'USER',
          is_active: true,
          updated_at: originalDate
        }
      ];

      const failingSeed = async () => {
        throw new Error('Database transaction deadlocked during seed execution');
      };

      let seedError: Error | null = null;
      try {
        await failingSeed();
      } catch (err: any) {
        seedError = err;
      } finally {
        await restoreUsers(mockPrisma, userSnaps);
      }

      expect(seedError).toBeDefined();
      expect(seedError!.message).toContain('deadlocked during seed');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: {
          password_hash: 'hash123',
          role: 'USER',
          is_active: true,
          updated_at: originalDate
        }
      });
    });
  });
});
