export type Role = 'USER' | 'ADMIN';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email?: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
