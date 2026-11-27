import { axiosClient } from './axiosClient.js';

export interface PlatformUser {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  is_active: boolean;
  created_at: string;
  updated_at?: string;
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
): Promise<PlatformUser> {
  const res = await axiosClient.patch<{ success: boolean; data: { user: PlatformUser } }>(
    `/admin/users/${userId}/status`,
    { is_active }
  );
  return res.data.data.user;
}
