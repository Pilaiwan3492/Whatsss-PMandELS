import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

export const DEMO_PASSWORD = 'Password123!';
export const DEMO_PASSWORD_HASH = bcrypt.hashSync(DEMO_PASSWORD, 10);

export interface MockUserRecord {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: 'USER' | 'ADMIN';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type AccountType = 'CASH' | 'LOAN_TAKEN' | 'LOAN_GIVEN' | 'INCOME' | 'EXPENSE';

export interface MockAccountRecord {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  opening_balance: Prisma.Decimal;
  is_opening_locked: boolean;
  created_at: Date;
  updated_at: Date;
}

export const mockUsers: MockUserRecord[] = [
  {
    id: 'user-a-uuid',
    username: 'user_demo',
    email: 'user_demo@whatsss.local',
    password_hash: DEMO_PASSWORD_HASH,
    role: 'USER',
    is_active: true,
    created_at: new Date('2026-11-01T00:00:00.000Z'),
    updated_at: new Date('2026-11-01T00:00:00.000Z')
  },
  {
    id: 'user-b-uuid',
    username: 'user_other',
    email: 'user_other@whatsss.local',
    password_hash: DEMO_PASSWORD_HASH,
    role: 'USER',
    is_active: true,
    created_at: new Date('2026-11-01T00:00:00.000Z'),
    updated_at: new Date('2026-11-01T00:00:00.000Z')
  },
  {
    id: 'admin-uuid',
    username: 'admin_demo',
    email: 'admin_demo@whatsss.local',
    password_hash: DEMO_PASSWORD_HASH,
    role: 'ADMIN',
    is_active: true,
    created_at: new Date('2026-11-01T00:00:00.000Z'),
    updated_at: new Date('2026-11-01T00:00:00.000Z')
  }
];

export const INITIAL_MOCK_ACCOUNTS: MockAccountRecord[] = [
  // user_demo accounts
  {
    id: 'acc-demo-checking',
    user_id: 'user-a-uuid',
    name: 'Checking Bank',
    type: 'CASH',
    opening_balance: new Prisma.Decimal('0.00'),
    is_opening_locked: false,
    created_at: new Date('2026-11-01T00:00:00.000Z'),
    updated_at: new Date('2026-11-01T00:00:00.000Z')
  },
  {
    id: 'acc-demo-cc',
    user_id: 'user-a-uuid',
    name: 'Visa Credit Card',
    type: 'LOAN_TAKEN',
    opening_balance: new Prisma.Decimal('0.00'),
    is_opening_locked: false,
    created_at: new Date('2026-11-01T00:00:01.000Z'),
    updated_at: new Date('2026-11-01T00:00:01.000Z')
  },
  {
    id: 'acc-demo-salary',
    user_id: 'user-a-uuid',
    name: 'Salary',
    type: 'INCOME',
    opening_balance: new Prisma.Decimal('0.00'),
    is_opening_locked: false,
    created_at: new Date('2026-11-01T00:00:02.000Z'),
    updated_at: new Date('2026-11-01T00:00:02.000Z')
  },
  {
    id: 'acc-demo-dining',
    user_id: 'user-a-uuid',
    name: 'Dining',
    type: 'EXPENSE',
    opening_balance: new Prisma.Decimal('0.00'),
    is_opening_locked: false,
    created_at: new Date('2026-11-01T00:00:03.000Z'),
    updated_at: new Date('2026-11-01T00:00:03.000Z')
  },
  {
    id: 'acc-demo-grocery',
    user_id: 'user-a-uuid',
    name: 'Grocery',
    type: 'EXPENSE',
    opening_balance: new Prisma.Decimal('0.00'),
    is_opening_locked: false,
    created_at: new Date('2026-11-01T00:00:04.000Z'),
    updated_at: new Date('2026-11-01T00:00:04.000Z')
  },
  // user_other accounts
  {
    id: 'acc-other-checking',
    user_id: 'user-b-uuid',
    name: 'Checking Bank',
    type: 'CASH',
    opening_balance: new Prisma.Decimal('0.00'),
    is_opening_locked: false,
    created_at: new Date('2026-11-01T00:00:00.000Z'),
    updated_at: new Date('2026-11-01T00:00:00.000Z')
  },
  {
    id: 'acc-other-cc',
    user_id: 'user-b-uuid',
    name: 'Visa Credit Card',
    type: 'LOAN_TAKEN',
    opening_balance: new Prisma.Decimal('0.00'),
    is_opening_locked: false,
    created_at: new Date('2026-11-01T00:00:01.000Z'),
    updated_at: new Date('2026-11-01T00:00:01.000Z')
  },
  {
    id: 'acc-other-salary',
    user_id: 'user-b-uuid',
    name: 'Salary',
    type: 'INCOME',
    opening_balance: new Prisma.Decimal('0.00'),
    is_opening_locked: false,
    created_at: new Date('2026-11-01T00:00:02.000Z'),
    updated_at: new Date('2026-11-01T00:00:02.000Z')
  },
  {
    id: 'acc-other-dining',
    user_id: 'user-b-uuid',
    name: 'Dining',
    type: 'EXPENSE',
    opening_balance: new Prisma.Decimal('0.00'),
    is_opening_locked: false,
    created_at: new Date('2026-11-01T00:00:03.000Z'),
    updated_at: new Date('2026-11-01T00:00:03.000Z')
  },
  {
    id: 'acc-other-grocery',
    user_id: 'user-b-uuid',
    name: 'Grocery',
    type: 'EXPENSE',
    opening_balance: new Prisma.Decimal('0.00'),
    is_opening_locked: false,
    created_at: new Date('2026-11-01T00:00:04.000Z'),
    updated_at: new Date('2026-11-01T00:00:04.000Z')
  }
];

export let mockAccounts: MockAccountRecord[] = JSON.parse(JSON.stringify(INITIAL_MOCK_ACCOUNTS)).map((acc: any) => ({
  ...acc,
  opening_balance: new Prisma.Decimal(acc.opening_balance),
  created_at: new Date(acc.created_at),
  updated_at: new Date(acc.updated_at)
}));

export function resetMockUsers(): void {
  mockUsers[0].is_active = true;
  mockUsers[0].role = 'USER';
  mockUsers[1].is_active = true;
  mockUsers[1].role = 'USER';
  mockUsers[2].is_active = true;
  mockUsers[2].role = 'ADMIN';
}

export function resetMockAccounts(): void {
  mockAccounts = INITIAL_MOCK_ACCOUNTS.map((acc) => ({
    ...acc,
    opening_balance: new Prisma.Decimal(acc.opening_balance.toString()),
    is_opening_locked: acc.is_opening_locked,
    created_at: new Date(acc.created_at),
    updated_at: new Date(acc.updated_at)
  }));
}

export function findMockUser(criteria: { username?: string; email?: string; id?: string }) {
  return mockUsers.find((u) => {
    if (criteria.id && u.id === criteria.id) return true;
    if (criteria.username && u.username === criteria.username) return true;
    if (criteria.email && u.email === criteria.email) return true;
    return false;
  }) || null;
}
