import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/whatsss_db?schema=public',
  jwtSecret: process.env.JWT_SECRET || 'whatsss_local_super_secret_jwt_key_2026_cpe334',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  isProduction: process.env.NODE_ENV === 'production'
};
