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

export function validatePort(portStr: string | undefined): number {
  if (!portStr || portStr.trim() === '') {
    return 5000;
  }
  const parsedPort = Number(portStr);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(`FATAL: PORT environment variable must be a valid integer between 1 and 65535. Received: "${portStr}"`);
  }
  return parsedPort;
}

export function validateClientUrl(clientUrl: string | undefined, isProduction: boolean): string {
  if (!clientUrl || clientUrl.trim() === '') {
    if (isProduction) {
      throw new Error('FATAL: CLIENT_URL environment variable is required in production. Must be configured to the full public URL of the application.');
    }
    return 'http://localhost:5173';
  }

  try {
    const parsed = new URL(clientUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Protocol must be http: or https:');
    }
  } catch {
    throw new Error(`FATAL: CLIENT_URL is not a valid URL. Received: "${clientUrl}"`);
  }

  return clientUrl;
}

export function validateDatabaseUrl(databaseUrl: string | undefined, isProduction: boolean): string {
  if (!databaseUrl || databaseUrl.trim() === '') {
    if (isProduction) {
      throw new Error('FATAL: DATABASE_URL environment variable is required in production.');
    }
    return '';
  }

  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    throw new Error('FATAL: DATABASE_URL must start with "postgresql://" or "postgres://" protocol scheme.');
  }

  try {
    new URL(databaseUrl);
  } catch {
    throw new Error('FATAL: DATABASE_URL is malformed and cannot be parsed as a valid connection URL.');
  }

  return databaseUrl;
}

export const INSECURE_JWT_PLACEHOLDERS = [
  'replace_with_a_long_random_secret_at_least_32_characters_for_production',
  'replace_with_a_long_random_secret',
  'your_jwt_secret_must_be_at_least_32_characters_long'
];

export function isPlaceholderSecret(secret: string): boolean {
  const lower = secret.toLowerCase();
  return (
    lower.includes('replace_with') ||
    lower.includes('placeholder') ||
    lower.includes('changeme') ||
    lower.includes('your_secret') ||
    lower.includes('example_secret') ||
    INSECURE_JWT_PLACEHOLDERS.some((p) => lower.includes(p.toLowerCase()))
  );
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

  if (nodeEnv !== 'test' && isPlaceholderSecret(secret)) {
    throw new Error(
      'FATAL: JWT_SECRET contains an insecure template placeholder from .env.example. ' +
      'You must generate and configure a unique, cryptographically random secret of at least 32 characters.'
    );
  }

  return secret;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const port = validatePort(env.PORT);
  const clientUrl = validateClientUrl(env.CLIENT_URL, isProduction);
  const databaseUrl = validateDatabaseUrl(env.DATABASE_URL, isProduction);
  const jwtSecret = validateJwtSecret(env.JWT_SECRET, nodeEnv);

  return {
    port,
    host: env.HOST || '0.0.0.0',
    clientUrl,
    nodeEnv,
    databaseUrl,
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '24h',
    isProduction,
    isTest,
    appCommitSha: env.APP_COMMIT_SHA || 'development'
  };
}

export const config = loadConfig();
