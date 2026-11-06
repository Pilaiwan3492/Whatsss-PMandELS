import bcrypt from 'bcrypt';

export const DEMO_PASSWORD = 'Password123!';
export const DEMO_PASSWORD_HASH = bcrypt.hashSync(DEMO_PASSWORD, 10);

export const mockUsers = [
  {
    id: 'user-a-uuid',
    username: 'user_demo',
    email: 'user_demo@whatsss.local',
    password_hash: DEMO_PASSWORD_HASH,
    role: 'USER' as const,
    is_active: true,
    created_at: new Date('2026-11-01T00:00:00.000Z'),
    updated_at: new Date('2026-11-01T00:00:00.000Z')
  },
  {
    id: 'user-b-uuid',
    username: 'user_other',
    email: 'user_other@whatsss.local',
    password_hash: DEMO_PASSWORD_HASH,
    role: 'USER' as const,
    is_active: true,
    created_at: new Date('2026-11-01T00:00:00.000Z'),
    updated_at: new Date('2026-11-01T00:00:00.000Z')
  },
  {
    id: 'admin-uuid',
    username: 'admin_demo',
    email: 'admin_demo@whatsss.local',
    password_hash: DEMO_PASSWORD_HASH,
    role: 'ADMIN' as const,
    is_active: true,
    created_at: new Date('2026-11-01T00:00:00.000Z'),
    updated_at: new Date('2026-11-01T00:00:00.000Z')
  }
];

export function findMockUser(criteria: { username?: string; email?: string; id?: string }) {
  return mockUsers.find((u) => {
    if (criteria.id && u.id === criteria.id) return true;
    if (criteria.username && u.username === criteria.username) return true;
    if (criteria.email && u.email === criteria.email) return true;
    return false;
  }) || null;
}
