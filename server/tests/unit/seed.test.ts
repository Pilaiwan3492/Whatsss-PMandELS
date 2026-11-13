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
      },
      account: {
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

  it('Case 7: Throws error when SEED_ADMIN_PASSWORD contains an insecure template placeholder', async () => {
    process.env.SEED_ADMIN_PASSWORD = 'replace_with_secure_admin_password_min_12_chars';
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(seed(mockPrisma)).rejects.toThrow(
      /FATAL: SEED_ADMIN_PASSWORD contains an insecure template placeholder/
    );
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

  it('Case 9: Provisions user_demo and standard accounts in production when SEED_DEMO_DATA is true and SEED_DEMO_PASSWORD is valid', async () => {
    process.env.SEED_DEMO_DATA = 'true';
    process.env.SEED_DEMO_PASSWORD = 'SecureDemoPassword2026!';
    process.env.SEED_DEMO_EMAIL = 'user_demo@whatsss.local';

    mockPrisma.user.findFirst.mockResolvedValue({ id: 'admin-id', role: 'ADMIN' });
    mockPrisma.user.findUnique.mockResolvedValue(null); // user_demo does not exist yet
    mockPrisma.user.create.mockResolvedValue({ id: 'demo-user-id', username: 'user_demo' });
    mockPrisma.account.upsert.mockResolvedValue({ id: 'acc-id' });

    await seed(mockPrisma);

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    const demoCreateCall = mockPrisma.user.create.mock.calls[0][0].data;
    expect(demoCreateCall.username).toBe('user_demo');
    expect(demoCreateCall.email).toBe('user_demo@whatsss.local');
    expect(demoCreateCall.role).toBe('USER');
    expect(demoCreateCall.is_active).toBe(true);
    expect(demoCreateCall.password_hash).toMatch(BCRYPT_REGEX);

    expect(mockPrisma.account.upsert).toHaveBeenCalledTimes(5);
    const standardNames = ['Checking Bank', 'Visa Credit Card', 'Salary', 'Dining', 'Grocery'];
    const upsertedAccountNames = mockPrisma.account.upsert.mock.calls.map(
      (call: any) => call[0].create.name
    );
    expect(upsertedAccountNames).toEqual(expect.arrayContaining(standardNames));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Production demo user (user_demo) provisioned securely'));
  });

  it('Case 10: Skips user_demo seeding when SEED_DEMO_DATA is true but SEED_DEMO_PASSWORD is missing or shorter than 12 chars', async () => {
    process.env.SEED_DEMO_DATA = 'true';
    process.env.SEED_DEMO_PASSWORD = 'Short1!'; // < 12 chars

    mockPrisma.user.findFirst.mockResolvedValue({ id: 'admin-id', role: 'ADMIN' });

    await seed(mockPrisma);

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.account.upsert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SEED_DEMO_PASSWORD is missing or shorter than 12 characters'));
  });

  it('Case 11: Preserves existing user_demo credentials while idempotently ensuring standard accounts exist', async () => {
    process.env.SEED_DEMO_DATA = 'true';
    process.env.SEED_DEMO_PASSWORD = 'SecureDemoPassword2026!';

    mockPrisma.user.findFirst.mockResolvedValue({ id: 'admin-id', role: 'ADMIN' });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'existing-demo-user-id',
      username: 'user_demo',
      role: 'USER',
      password_hash: '$2b$10$ExistingDemoHashValueHere12345678901234567890123456'
    });
    mockPrisma.account.upsert.mockResolvedValue({ id: 'acc-id' });

    await seed(mockPrisma);

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.account.upsert).toHaveBeenCalledTimes(5);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Production demo user (user_demo) already exists'));
  });

  it('Case 12: Skips admin seeding but continues demo user seeding when SEED_ADMIN_PASSWORD is missing and SEED_DEMO_DATA is true', async () => {
    delete process.env.SEED_ADMIN_PASSWORD;
    process.env.SEED_DEMO_DATA = 'true';
    process.env.SEED_DEMO_PASSWORD = 'SecureDemoPassword2026!';

    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'demo-user-id', username: 'user_demo', role: 'USER' });
    mockPrisma.account.upsert.mockResolvedValue({ id: 'acc-id' });

    await seed(mockPrisma);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping administrator seeding'));
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.create.mock.calls[0][0].data.username).toBe('user_demo');
    expect(mockPrisma.account.upsert).toHaveBeenCalledTimes(5);
  });
});

describe('Unit Test: User Demo Provisioning, Conflict Handling & Role Protection', () => {
  const originalEnv = process.env;
  const DEMO_PASSWORD = 'SecureDemoPassword2026!';
  const BCRYPT_REGEX = /^\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}$/;

  let mockPrisma: any;
  let logSpy: any;
  let warnSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'production';
    process.env.SEED_ADMIN_PASSWORD = 'SecureAdminPassword2026!';
    process.env.SEED_DEMO_DATA = 'true';
    process.env.SEED_DEMO_PASSWORD = DEMO_PASSWORD;
    process.env.SEED_DEMO_EMAIL = 'user_demo@whatsss.local';

    mockPrisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'admin-id', role: 'ADMIN' }),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn()
      },
      account: {
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

  it('1. ไม่พบ user_demo -> สร้าง USER สำเร็จ และสร้างบัญชีการเงินครบ 5 บัญชี', async () => {
    // Neither username user_demo nor email user_demo@whatsss.local exist
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'new-demo-user-id',
      username: 'user_demo',
      email: 'user_demo@whatsss.local',
      role: 'USER',
      password_hash: '$2b$10$DemoHashedPasswordValueStringGoesHere12345678901234'
    });
    mockPrisma.account.upsert.mockResolvedValue({ id: 'acc-id' });

    await seed(mockPrisma);

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    const createdUser = mockPrisma.user.create.mock.calls[0][0].data;
    expect(createdUser.username).toBe('user_demo');
    expect(createdUser.role).toBe('USER');
    expect(createdUser.email).toBe('user_demo@whatsss.local');
    expect(createdUser.password_hash).toMatch(BCRYPT_REGEX);
    expect(mockPrisma.account.upsert).toHaveBeenCalledTimes(5);
  });

  it('2. พบ user_demo ที่เป็น USER -> ใช้บัญชีเดิม โดยไม่เปลี่ยนรหัสผ่านหรือ role', async () => {
    const originalHash = '$2b$10$OriginalPreservedUserDemoPasswordHash123456789012';
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'existing-demo-user-id',
      username: 'user_demo',
      email: 'user_demo@whatsss.local',
      role: 'USER',
      password_hash: originalHash
    });
    mockPrisma.account.upsert.mockResolvedValue({ id: 'acc-id' });

    await seed(mockPrisma);

    // Must NOT recreate or mutate user
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
    // Accounts are idempotently provisioned for the existing USER id
    expect(mockPrisma.account.upsert).toHaveBeenCalledTimes(5);
    expect(mockPrisma.account.upsert.mock.calls[0][0].where.user_id_name.user_id).toBe('existing-demo-user-id');
  });

  it('3. พบ user_demo ที่เป็น ADMIN -> หยุดด้วย Error และไม่สร้างบัญชีการเงิน', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'admin-occupied-id',
      username: 'user_demo',
      email: 'user_demo@whatsss.local',
      role: 'ADMIN',
      password_hash: '$2b$10$ExistingAdminPasswordHashHere12345678901234567890'
    });

    await expect(seed(mockPrisma)).rejects.toThrow(
      /FATAL: User "user_demo" already exists with non-USER role "ADMIN"/
    );

    // Verify user role was NOT downgraded and no accounts were created
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.account.upsert).not.toHaveBeenCalled();
  });

  it('4. Email ถูกใช้โดยผู้ใช้อื่น -> หยุดด้วย Error ชัดเจนและไม่สร้าง user_demo', async () => {
    // username 'user_demo' is free, but email 'user_demo@whatsss.local' is taken by 'other_user'
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.username === 'user_demo') return null;
      if (where.email === 'user_demo@whatsss.local') {
        return {
          id: 'other-user-uuid',
          username: 'other_user',
          email: 'user_demo@whatsss.local',
          role: 'USER'
        };
      }
      return null;
    });

    await expect(seed(mockPrisma)).rejects.toThrow(
      /FATAL: Email "user_demo@whatsss.local" is already in use by user "other_user"/
    );

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.account.upsert).not.toHaveBeenCalled();
  });

  it('5. Username ซ้ำ -> ไม่สร้างผู้ใช้ซ้ำ', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'existing-id',
      username: 'user_demo',
      role: 'USER',
      password_hash: '$2b$10$SomeHashValue12345678901234567890123456789012345678'
    });

    await seed(mockPrisma);

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('6. Seed ทำงานซ้ำ -> ไม่สร้างบัญชีการเงินซ้ำ (Idempotent upsert)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'existing-id',
      username: 'user_demo',
      role: 'USER',
      password_hash: '$2b$10$SomeHashValue12345678901234567890123456789012345678'
    });
    mockPrisma.account.upsert.mockResolvedValue({ id: 'acc-id' });

    // Invocations 1 and 2
    await seed(mockPrisma);
    await seed(mockPrisma);

    // Each run performs upsert with empty update: {} ensuring zero duplicate rows
    expect(mockPrisma.account.upsert).toHaveBeenCalledTimes(10);
    const firstCallUpdate = mockPrisma.account.upsert.mock.calls[0][0].update;
    expect(firstCallUpdate).toEqual({});
  });

  it('7. รหัสผ่านของผู้ใช้เดิม -> ต้องไม่ถูกเปลี่ยน', async () => {
    const originalPasswordHash = '$2b$10$OriginalUntouchedPasswordHashValue123456789012345';
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'existing-demo-id',
      username: 'user_demo',
      role: 'USER',
      password_hash: originalPasswordHash
    });

    await seed(mockPrisma);

    // user.update must NOT be called to touch password_hash
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('8. Role ของผู้ใช้เดิม -> ต้องไม่ถูกเปลี่ยน', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'existing-admin-id',
      username: 'user_demo',
      role: 'ADMIN',
      password_hash: '$2b$10$AdminHash1234567890123456789012345678901234567890'
    });

    await expect(seed(mockPrisma)).rejects.toThrow();

    // Verify role was not mutated via update
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('9. Role ไม่ใช่ USER -> ต้องไม่มีการสร้างบัญชีการเงิน', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'non-user-id',
      username: 'user_demo',
      role: 'ADMIN'
    });

    await expect(seed(mockPrisma)).rejects.toThrow();

    // Zero financial accounts created for non-USER
    expect(mockPrisma.account.upsert).not.toHaveBeenCalled();
  });

  it('10. Production Seed -> ไม่สร้างบัญชีการเงินให้ ADMIN (BR-10 Compliance)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SEED_ADMIN_PASSWORD = 'SecureAdminPassword2026!';
    delete process.env.SEED_DEMO_DATA; // Demo data disabled

    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'new-admin-id', username: 'admin', role: 'ADMIN' });

    await seed(mockPrisma);

    // Initial administrator is created, but ZERO financial accounts must be created for ADMIN
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.account.upsert).not.toHaveBeenCalled();
  });

  it('11. Throws error when SEED_DEMO_PASSWORD contains an insecure template placeholder', async () => {
    process.env.SEED_DEMO_PASSWORD = 'replace_with_secure_demo_password_min_12_chars';
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(seed(mockPrisma)).rejects.toThrow(
      /FATAL: SEED_DEMO_PASSWORD contains an insecure template placeholder/
    );
  });
});

describe('Unit Test: Development/Test Seed Role Enforcement & Non-Destructive Idempotency', () => {
  const originalEnv = process.env;
  let mockPrisma: any;
  let usersDb: Map<string, any>;
  let accountsDb: Map<string, any>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';

    usersDb = new Map();
    accountsDb = new Map();

    mockPrisma = {
      user: {
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where.username) {
            return usersDb.get(where.username) || null;
          }
          if (where.email) {
            for (const u of usersDb.values()) {
              if (u.email === where.email) return u;
            }
            return null;
          }
          return null;
        }),
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const record = { id: `id-${data.username}`, ...data };
          usersDb.set(data.username, record);
          return record;
        }),
        update: vi.fn(),
        upsert: vi.fn()
      },
      account: {
        upsert: vi.fn().mockImplementation(async ({ where, update, create }: any) => {
          const key = `${where.user_id_name.user_id}:${where.user_id_name.name}`;
          if (accountsDb.has(key)) {
            const existing = accountsDb.get(key);
            const updated = { ...existing, ...update };
            accountsDb.set(key, updated);
            return updated;
          }
          const created = { id: `acc-${key}`, ...create };
          accountsDb.set(key, created);
          return created;
        })
      }
    };

    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('creates user_demo and user_other with USER role and 5 standard accounts each, while admin_demo gets ADMIN role and 0 accounts', async () => {
    await seed(mockPrisma);

    const userDemo = usersDb.get('user_demo');
    const userOther = usersDb.get('user_other');
    const adminDemo = usersDb.get('admin_demo');

    expect(userDemo).toBeDefined();
    expect(userDemo.role).toBe('USER');
    expect(userOther).toBeDefined();
    expect(userOther.role).toBe('USER');
    expect(adminDemo).toBeDefined();
    expect(adminDemo.role).toBe('ADMIN');

    // Only user_demo (5) and user_other (5) receive standard accounts = 10 total
    expect(accountsDb.size).toBe(10);
    for (const acc of accountsDb.values()) {
      expect([userDemo.id, userOther.id]).toContain(acc.user_id);
      expect(acc.user_id).not.toBe(adminDemo.id);
    }
  });

  it('is idempotent on second run without creating duplicate accounts or overwriting existing balances or passwords', async () => {
    await seed(mockPrisma);

    // Mutate user_demo password and Checking Bank balance to simulate developer state
    const userDemo = usersDb.get('user_demo');
    userDemo.password_hash = '$2b$10$CustomDeveloperPasswordHashNotToBeOverwritten123456';
    const checkingKey = `${userDemo.id}:Checking Bank`;
    const checkingAcc = accountsDb.get(checkingKey);
    checkingAcc.opening_balance = 25000.00;
    checkingAcc.is_opening_locked = true;

    await seed(mockPrisma);

    expect(accountsDb.size).toBe(10);
    expect(usersDb.get('user_demo').password_hash).toBe('$2b$10$CustomDeveloperPasswordHashNotToBeOverwritten123456');
    expect(accountsDb.get(checkingKey).opening_balance).toBe(25000.00);
    expect(accountsDb.get(checkingKey).is_opening_locked).toBe(true);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('throws fatal error when existing user_demo has role ADMIN and does not mutate role or create accounts', async () => {
    usersDb.set('user_demo', {
      id: 'id-user_demo',
      username: 'user_demo',
      email: 'user_demo@whatsss.local',
      role: 'ADMIN',
      password_hash: 'existing-hash',
      is_active: true
    });

    await expect(seed(mockPrisma)).rejects.toThrow(
      /FATAL: User "user_demo" already exists with non-USER role "ADMIN"/
    );
    expect(usersDb.get('user_demo').role).toBe('ADMIN');
    expect(accountsDb.size).toBe(0);
  });

  it('throws fatal error when existing user_other has role ADMIN and does not mutate role or create accounts', async () => {
    usersDb.set('user_other', {
      id: 'id-user_other',
      username: 'user_other',
      email: 'user_other@whatsss.local',
      role: 'ADMIN',
      password_hash: 'existing-hash',
      is_active: true
    });

    await expect(seed(mockPrisma)).rejects.toThrow(
      /FATAL: User "user_other" already exists with non-USER role "ADMIN"/
    );
    expect(usersDb.get('user_other').role).toBe('ADMIN');
    expect(accountsDb.size).toBe(0);
  });

  it('throws fatal error when existing admin_demo has non-ADMIN role (USER) instead of silently changing role', async () => {
    usersDb.set('admin_demo', {
      id: 'id-admin_demo',
      username: 'admin_demo',
      email: 'admin_demo@whatsss.local',
      role: 'USER',
      password_hash: 'existing-hash',
      is_active: true
    });

    await expect(seed(mockPrisma)).rejects.toThrow(
      /FATAL: User "admin_demo" already exists with non-ADMIN role "USER"/
    );
    expect(usersDb.get('admin_demo').role).toBe('USER');
    expect(accountsDb.size).toBe(0);
  });
});
