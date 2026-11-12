import dotenv from 'dotenv';
import path from 'path';

// Load .env if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  port: number;
  host: string;
  clientUrl: string;
  nodeEnv: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  isProduction: boolean;
  isTest: boolean;
  appCommitSha: string;
}

export function validateJwtSecret(secret: string | undefined, nodeEnv: string): string {
  if (!secret || secret.trim() === '') {
    if (nodeEnv === 'test') {
      return 'test_only_ephemeral_jwt_secret_key_minimum_32_characters';
    }
    throw new Error('FATAL: JWT_SECRET environment variable is missing. A secure random string of at least 32 characters must be configured.');
  }

  if (secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters long for cryptographic security.');
  }

  return secret;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';
  const jwtSecret = validateJwtSecret(env.JWT_SECRET, nodeEnv);

  return {
    port: parseInt(env.PORT || '5000', 10),
    host: env.HOST || '0.0.0.0',
    clientUrl: env.CLIENT_URL || 'http://localhost:5173',
    nodeEnv,
    databaseUrl: env.DATABASE_URL || '',
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '24h',
    isProduction,
    isTest,
    appCommitSha: env.APP_COMMIT_SHA || 'development'
  };
}

export const config = loadConfig();
