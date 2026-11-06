export type Role = 'USER' | 'ADMIN';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
