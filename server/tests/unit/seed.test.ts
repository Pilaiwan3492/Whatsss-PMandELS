import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcrypt';
import { seed } from '../../prisma/seed.js';

describe('Unit Test: Production Seed Admin Provisioning & Conflict Handling (TASK 3)', () => {
  const originalEnv = process.env;
  const PROD_PASSWORD = 'SecureAdminPassword2026!';
  const BCRYPT_REGEX = /^\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}$/;

  let mockPrisma: any;
  let logSpy: any;
  let warnSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'production';
    process.env.SEED_ADMIN_PASSWORD = PROD_PASSWORD;
    process.env.SEED_ADMIN_EMAIL = 'admin@whatsss.local';

    mockPrisma = {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn()
      }
    };

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('Case 1: Provisions initial administrator account when no admin and no conflict exist', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'admin-id' });

    await seed(mockPrisma);

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({ where: { role: 'ADMIN' } });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'admin' } });
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);

    const createArg = mockPrisma.user.create.mock.calls[0][0].data;
    expect(createArg.username).toBe('admin');
    expect(createArg.email).toBe('admin@whatsss.local');
    expect(createArg.role).toBe('ADMIN');
    expect(createArg.is_active).toBe(true);

    // Hash must match bcrypt pattern and verify with original password
    expect(createArg.password_hash).toMatch(BCRYPT_REGEX);
    expect(createArg.password_hash).not.toBe(PROD_PASSWORD);
    const matches = await bcrypt.compare(PROD_PASSWORD, createArg.password_hash);
    expect(matches).toBe(true);
  });

  it('Case 2: Preserves existing administrator without mutating credentials or creating duplicates', async () => {
    const existingAdminRecord = {
      id: 'existing-admin-uuid',
      username: 'admin',
      role: 'ADMIN',
      password_hash: '$2b$10$ExistingStoredBcryptHashStringValueHere123456789012345678',
      is_active: true
    };
    mockPrisma.user.findFirst.mockResolvedValue(existingAdminRecord);

    await seed(mockPrisma);

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({ where: { role: 'ADMIN' } });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Preserving existing credentials'));
  });

  it('Case 3: Throws fatal error on username conflict when "admin" exists with non-ADMIN role', async () => {
    // No ADMIN role account found, but username "admin" is occupied by a USER
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'conflicting-user-id',
      username: 'admin',
      role: 'USER',
      password_hash: '$2b$10$UserHashValueHere12345678901234567890123456789012345678',
      is_active: true
    });

    await expect(seed(mockPrisma)).rejects.toThrow(
      /Username "admin" already exists with non-ADMIN role/
    );

    // Verify user was NOT promoted and no new account was created
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('Case 4: Seed is strictly idempotent across repeated invocations', async () => {
    // First run: Admin already exists
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'existing-admin-uuid',
      username: 'admin',
      role: 'ADMIN'
    });

    await seed(mockPrisma);
    await seed(mockPrisma);

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('Case 5: Skips seeding when SEED_ADMIN_PASSWORD is missing in production', async () => {
    delete process.env.SEED_ADMIN_PASSWORD;

    await seed(mockPrisma);

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('configure SEED_ADMIN_PASSWORD'));
  });

  it('Case 6: Skips seeding when SEED_ADMIN_PASSWORD is shorter than 12 characters', async () => {
    process.env.SEED_ADMIN_PASSWORD = 'Short1!'; // < 12 chars

    await seed(mockPrisma);

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('configure SEED_ADMIN_PASSWORD (min 12 chars)'));
  });

  it('Case 7: Proves that plaintext password is never passed to database create operation', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'admin-id' });

    await seed(mockPrisma);

    const createCall = mockPrisma.user.create.mock.calls[0][0].data;
    expect(createCall.password_hash).not.toBe(PROD_PASSWORD);
    expect(createCall.password_hash).not.toContain(PROD_PASSWORD);
  });

  it('Case 8: Proves that administrator password and secret are never logged to console outputs', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'admin-id' });

    await seed(mockPrisma);

    const allLogs = [
      ...logSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat()
    ].join(' ');

    expect(allLogs).not.toContain(PROD_PASSWORD);
  });
});
