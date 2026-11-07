import { describe, it, expect, vi } from 'vitest';
import { lockAccounts, AccountLockError } from '../../src/services/accountLock.service.js';

describe('Unit Test: Hardened accountLock.service (P2 Finding)', () => {
  it('deduplicates account IDs and locks only once per unique ID', async () => {
    const mockTx = {
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'acc-1', is_opening_locked: false },
          { id: 'acc-2', is_opening_locked: false }
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 })
      }
    } as any;

    await lockAccounts(
      mockTx,
      ['acc-1', 'acc-2', 'acc-1', 'acc-2', 'acc-1'], // Duplicate IDs
      'user-1'
    );

    // findMany called with deduplicated IDs
    expect(mockTx.account.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['acc-1', 'acc-2'] },
        user_id: 'user-1'
      },
      select: {
        id: true,
        is_opening_locked: true
      }
    });

    // updateMany called for unlocked accounts
    expect(mockTx.account.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['acc-1', 'acc-2'] },
        user_id: 'user-1',
        is_opening_locked: false
      },
      data: {
        is_opening_locked: true,
        updated_at: expect.any(Date)
      }
    });
  });

  it('throws AccountLockError and aborts without update when requested account is missing', async () => {
    const mockTx = {
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'acc-1', is_opening_locked: false }
          // acc-missing not returned
        ]),
        updateMany: vi.fn()
      }
    } as any;

    await expect(
      lockAccounts(mockTx, ['acc-1', 'acc-missing'], 'user-1')
    ).rejects.toThrow(AccountLockError);

    expect(mockTx.account.updateMany).not.toHaveBeenCalled();
  });

  it('throws AccountLockError and aborts without partial locking when foreign account ID is included', async () => {
    const mockTx = {
      account: {
        // user-1 owns acc-owned, but foreign-acc belongs to user-2 so findMany returns only acc-owned
        findMany: vi.fn().mockResolvedValue([
          { id: 'acc-owned', is_opening_locked: false }
        ]),
        updateMany: vi.fn()
      }
    } as any;

    await expect(
      lockAccounts(mockTx, ['acc-owned', 'foreign-acc'], 'user-1')
    ).rejects.toThrow(AccountLockError);

    // Assert zero database mutations occur (no partial locking)
    expect(mockTx.account.updateMany).not.toHaveBeenCalled();
  });

  it('rejects empty string account ID with AccountLockError and does not query DB', async () => {
    const mockTx = {
      account: {
        findMany: vi.fn(),
        updateMany: vi.fn()
      }
    } as any;

    await expect(
      lockAccounts(mockTx, ['acc-1', ''], 'user-1')
    ).rejects.toThrow(AccountLockError);

    expect(mockTx.account.findMany).not.toHaveBeenCalled();
    expect(mockTx.account.updateMany).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only account ID with AccountLockError and does not query DB', async () => {
    const mockTx = {
      account: {
        findMany: vi.fn(),
        updateMany: vi.fn()
      }
    } as any;

    await expect(
      lockAccounts(mockTx, ['acc-1', '   '], 'user-1')
    ).rejects.toThrow(AccountLockError);

    expect(mockTx.account.findMany).not.toHaveBeenCalled();
    expect(mockTx.account.updateMany).not.toHaveBeenCalled();
  });

  it('rejects non-string account ID with AccountLockError and does not query DB', async () => {
    const mockTx = {
      account: {
        findMany: vi.fn(),
        updateMany: vi.fn()
      }
    } as any;

    await expect(
      lockAccounts(mockTx, ['acc-1', 123 as any], 'user-1')
    ).rejects.toThrow(AccountLockError);

    await expect(
      lockAccounts(mockTx, [null as any], 'user-1')
    ).rejects.toThrow(AccountLockError);

    expect(mockTx.account.findMany).not.toHaveBeenCalled();
    expect(mockTx.account.updateMany).not.toHaveBeenCalled();
  });

  it('skips redundant database updates if all accounts are already locked', async () => {
    const mockTx = {
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'acc-1', is_opening_locked: true },
          { id: 'acc-2', is_opening_locked: true }
        ]),
        updateMany: vi.fn()
      }
    } as any;

    await lockAccounts(mockTx, ['acc-1', 'acc-2'], 'user-1');

    expect(mockTx.account.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when accountIds is empty', async () => {
    const mockTx = {
      account: {
        findMany: vi.fn(),
        updateMany: vi.fn()
      }
    } as any;

    await lockAccounts(mockTx, [], 'user-1');

    expect(mockTx.account.findMany).not.toHaveBeenCalled();
    expect(mockTx.account.updateMany).not.toHaveBeenCalled();
  });
});
