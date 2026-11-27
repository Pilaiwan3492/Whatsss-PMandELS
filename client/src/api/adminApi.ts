import { axiosClient } from './axiosClient.js';

/**
 * Contract-approved 6-field response shape for GET /api/admin/users (Issue #59, FR-03, BR-10).
 */
export interface PlatformUser {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  is_active: boolean;
  created_at: string;
}

/**
 * Response shape for PATCH /api/admin/users/:id/status (Issue #59, FR-04).
 */
export interface PlatformUserStatusUpdate {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  is_active: boolean;
  updated_at: string;
}

export async function getAdminUsers(): Promise<PlatformUser[]> {
  const res = await axiosClient.get<{ success: boolean; data: { users: PlatformUser[] } }>(
    '/admin/users'
  );
  return res.data.data.users;
}

export async function updateAdminUserStatus(
  userId: string,
  is_active: boolean
): Promise<PlatformUserStatusUpdate> {
  const res = await axiosClient.patch<{
    success: boolean;
    data: { user: PlatformUserStatusUpdate };
  }>(`/admin/users/${userId}/status`, { is_active });
  return res.data.data.user;
}
