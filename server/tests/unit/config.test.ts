import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import {
  validateJwtSecret,
  validatePort,
  validateClientUrl,
  validateDatabaseUrl,
  buildDatabaseUrl,
  loadConfig
} from '../../src/config/env.js';

describe('Unit Test: Environment Configuration & Security Validation (Section 2.1)', () => {
  const validSecret = 'valid_cryptographic_secret_with_sufficient_length_2026';
  const validDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/whatsss_prod?schema=public';
  const validClientUrl = 'https://whatsss.example.com';

  describe('JWT Secret Security', () => {
    it('throws a fatal error if JWT_SECRET is missing in production or development', () => {
      expect(() => validateJwtSecret('', 'production')).toThrow(/FATAL: JWT_SECRET environment variable is missing/);
      expect(() => validateJwtSecret(undefined, 'development')).toThrow(/FATAL: JWT_SECRET environment variable is missing/);
    });

    it('throws a fatal error if JWT_SECRET is shorter than 32 characters', () => {
      const shortSecret = 'short_insecure_secret_123';
      expect(() => validateJwtSecret(shortSecret, 'production')).toThrow(/FATAL: JWT_SECRET must be at least 32 characters long/);
      expect(() => validateJwtSecret(shortSecret, 'development')).toThrow(/FATAL: JWT_SECRET must be at least 32 characters long/);
    });

    it('throws a fatal error if JWT_SECRET contains an insecure template placeholder from .env.example in production or development', () => {
      const placeholderSecret = 'replace_with_a_long_random_secret_at_least_32_characters_for_production';
      expect(() => validateJwtSecret(placeholderSecret, 'production')).toThrow(/FATAL: JWT_SECRET contains an insecure template placeholder/);
      expect(() => validateJwtSecret(placeholderSecret, 'development')).toThrow(/FATAL: JWT_SECRET contains an insecure template placeholder/);
    });

    it('accepts and initializes successfully when a valid secret (>= 32 chars) is provided', () => {
      const result = validateJwtSecret(validSecret, 'production');
      expect(result).toBe(validSecret);
    });

    it('rejects tokens signed with an invalid or incorrect secret', () => {
      const legitimateSecret = 'legitimate_secret_key_with_at_least_32_characters_123';
      const attackerSecret = 'attacker_secret_key_with_at_least_32_characters_456';

      const forgedToken = jwt.sign(
        { userId: 'user-a-uuid', username: 'user_demo', role: 'ADMIN' },
        attackerSecret,
        { expiresIn: '1h' }
      );

      expect(() => {
        jwt.verify(forgedToken, legitimateSecret);
      }).toThrow(jwt.JsonWebTokenError);
    });

    it('verifies that no hardcoded production secret exists in source code files', () => {
      const srcDir = path.resolve(__dirname, '../../src');
      const files = fs.readdirSync(srcDir, { recursive: true }) as string[];

      for (const file of files) {
        const filePath = path.join(srcDir, file);
        if (fs.statSync(filePath).isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
          const content = fs.readFileSync(filePath, 'utf-8');
          expect(content).not.toContain('whatsss_local_super_secret_jwt_key_2026_cpe334');
        }
      }
    });
  });

  describe('PORT Validation', () => {
    it('defaults to 5000 when PORT is undefined or empty', () => {
      expect(validatePort(undefined)).toBe(5000);
      expect(validatePort('')).toBe(5000);
    });

    it('parses valid integer port', () => {
      expect(validatePort('8080')).toBe(8080);
      expect(validatePort('3000')).toBe(3000);
    });

    it('throws fatal error when PORT is non-numeric, decimal, or out of range', () => {
      expect(() => validatePort('invalid')).toThrow(/PORT environment variable must be a valid integer between 1 and 65535/);
      expect(() => validatePort('0')).toThrow(/PORT environment variable must be a valid integer between 1 and 65535/);
      expect(() => validatePort('-1')).toThrow(/PORT environment variable must be a valid integer between 1 and 65535/);
      expect(() => validatePort('70000')).toThrow(/PORT environment variable must be a valid integer between 1 and 65535/);
      expect(() => validatePort('80.5')).toThrow(/PORT environment variable must be a valid integer between 1 and 65535/);
    });
  });

  describe('CLIENT_URL Validation', () => {
    it('defaults to localhost in development/test when omitted', () => {
      expect(validateClientUrl(undefined, false)).toBe('http://localhost:5173');
      expect(validateClientUrl('', false)).toBe('http://localhost:5173');
    });

    it('throws fatal error in production when CLIENT_URL is missing', () => {
      expect(() => validateClientUrl(undefined, true)).toThrow(/FATAL: CLIENT_URL environment variable is required in production/);
      expect(() => validateClientUrl('', true)).toThrow(/FATAL: CLIENT_URL environment variable is required in production/);
    });

    it('throws fatal error when CLIENT_URL is not a valid URL or has unsupported protocol', () => {
      expect(() => validateClientUrl('not-a-url', false)).toThrow(/FATAL: CLIENT_URL is not a valid URL/);
      expect(() => validateClientUrl('ftp://example.com', false)).toThrow(/FATAL: CLIENT_URL is not a valid URL/);
    });

    it('accepts valid HTTP/HTTPS URLs and normalizes trailing slash to pure origin', () => {
      expect(validateClientUrl('https://example.com', true)).toBe('https://example.com');
      expect(validateClientUrl('https://example.com/', true)).toBe('https://example.com');
      expect(validateClientUrl('https://whatsss.a.run.app', true)).toBe('https://whatsss.a.run.app');
      expect(validateClientUrl('http://localhost:5173', false)).toBe('http://localhost:5173');
      expect(validateClientUrl('http://localhost:5173/', false)).toBe('http://localhost:5173');
    });

    it('rejects CLIENT_URL containing a non-root path, query string, hash fragment, or embedded credentials', () => {
      expect(() => validateClientUrl('https://example.com/app', true)).toThrow(
        /FATAL: CLIENT_URL must contain only an origin, without path, query, or hash/
      );
      expect(() => validateClientUrl('https://example.com?foo=bar', true)).toThrow(
        /FATAL: CLIENT_URL must contain only an origin, without path, query, or hash/
      );
      expect(() => validateClientUrl('https://example.com#section', true)).toThrow(
        /FATAL: CLIENT_URL must contain only an origin, without path, query, or hash/
      );
      expect(() => validateClientUrl('https://user:pass@example.com', true)).toThrow(
        /FATAL: CLIENT_URL must not contain credentials/
      );
    });

    it('rejects non-HTTPS non-loopback CLIENT_URL in production while allowing HTTP localhost in development', () => {
      expect(() => validateClientUrl('http://example.com', true)).toThrow(
        /FATAL: CLIENT_URL must use HTTPS in production/
      );
      expect(validateClientUrl('http://localhost:5173', false)).toBe('http://localhost:5173');
    });
  });

  describe('DATABASE_URL Validation', () => {
    it('returns empty string in non-production when omitted', () => {
      expect(validateDatabaseUrl(undefined, false)).toBe('');
      expect(validateDatabaseUrl('', false)).toBe('');
    });

    it('throws fatal error in production when DATABASE_URL is missing', () => {
      expect(() => validateDatabaseUrl(undefined, true)).toThrow(/FATAL: DATABASE_URL environment variable is required in production/);
      expect(() => validateDatabaseUrl('', true)).toThrow(/FATAL: DATABASE_URL environment variable is required in production/);
    });

    it('throws fatal error when DATABASE_URL does not use postgresql:// or postgres:// scheme', () => {
      expect(() => validateDatabaseUrl('mysql://user:pass@host:3306/db', false)).toThrow(
        /FATAL: DATABASE_URL must start with "postgresql:\/\/" or "postgres:\/\/" protocol scheme/
      );
      expect(() => validateDatabaseUrl('sqlite://test.db', true)).toThrow(
        /FATAL: DATABASE_URL must start with "postgresql:\/\/" or "postgres:\/\/" protocol scheme/
      );
    });

    it('validates URL parseability without leaking database credentials in errors', () => {
      expect(() => validateDatabaseUrl('postgresql://[invalid-host-format', false)).toThrow(
        /FATAL: DATABASE_URL is malformed and cannot be parsed as a valid connection URL/
      );
    });

    it('accepts valid postgresql connection strings including URL-encoded special characters and rejects unencoded special characters', () => {
      expect(validateDatabaseUrl(validDatabaseUrl, true)).toBe(validDatabaseUrl);
      expect(validateDatabaseUrl('postgres://user:pass@localhost:5432/db', false)).toBe(
        'postgres://user:pass@localhost:5432/db'
      );
      const encodedSpecialPwdUrl = 'postgresql://whatsss_user:P%40ss%23w0rd%2F1%3A2!@localhost:5432/whatsss_db?schema=public';
      expect(validateDatabaseUrl(encodedSpecialPwdUrl, true)).toBe(encodedSpecialPwdUrl);

      const unencodedSpecialPwdUrl = 'postgresql://whatsss_user:P@ss#w0rd/1:2!@localhost:5432/whatsss_db?schema=public';
      expect(() => validateDatabaseUrl(unencodedSpecialPwdUrl, true)).toThrow(
        /FATAL: DATABASE_URL is malformed and cannot be parsed as a valid connection URL/
      );
    });

    it('P1-07: encodes special-character passwords safely via buildDatabaseUrl and validates without leaking passwords in errors', () => {
      const passwordCases = [
        'normal123',
        'p@ssword',
        'p#ssword',
        'p/ssword',
        'p:ssword'
      ];

      for (const rawPassword of passwordCases) {
        const constructedUrl = buildDatabaseUrl({
          user: 'postgres',
          password: rawPassword,
          host: 'localhost',
          port: 5432,
          database: 'whatsss_db',
          schema: 'public'
        });

        // Must preserve URI separators while encoding only credentials
        expect(constructedUrl.startsWith('postgresql://postgres:')).toBe(true);
        expect(constructedUrl.endsWith('@localhost:5432/whatsss_db?schema=public')).toBe(true);
        expect(validateDatabaseUrl(constructedUrl, true)).toBe(constructedUrl);
      }

      // Also verify Cloud SQL Unix socket construction preserves ?host=/cloudsql/...
      const cloudSqlUrl = buildDatabaseUrl({
        user: 'postgres',
        password: 'p@ss#word/1:2',
        database: 'whatsss_prod',
        schema: 'public',
        cloudSqlInstance: 'proj:asia-southeast1:inst'
      });
      expect(cloudSqlUrl).toBe(
        'postgresql://postgres:p%40ss%23word%2F1%3A2@localhost/whatsss_prod?host=/cloudsql/proj:asia-southeast1:inst&schema=public'
      );
      expect(validateDatabaseUrl(cloudSqlUrl, true)).toBe(cloudSqlUrl);

      // Verify raw unencoded special passwords (@, #, /) and invalid URLs fail safely without leaking the password in the error message
      for (const badPassword of ['p@sswordSecret99', 'p#sswordSecret99', 'p/sswordSecret99']) {
        const rawBrokenUrl = `postgresql://postgres:${badPassword}@localhost:5432/whatsss_db`;
        try {
          validateDatabaseUrl(rawBrokenUrl, true);
          expect.fail(`Expected raw unencoded URL with ${badPassword} to throw`);
        } catch (err: any) {
          expect(err.message).toMatch(/FATAL: DATABASE_URL is malformed/);
          expect(err.message).not.toContain(badPassword);
        }
      }
    });
  });

  describe('Full loadConfig Integration', () => {
    it('loads valid production configuration', () => {
      const loaded = loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: validSecret,
        CLIENT_URL: validClientUrl,
        DATABASE_URL: validDatabaseUrl,
        PORT: '8080',
        HOST: '0.0.0.0',
        APP_COMMIT_SHA: 'sha-abc1234'
      });

      expect(loaded.jwtSecret).toBe(validSecret);
      expect(loaded.isProduction).toBe(true);
      expect(loaded.clientUrl).toBe(validClientUrl);
      expect(loaded.databaseUrl).toBe(validDatabaseUrl);
      expect(loaded.port).toBe(8080);
      expect(loaded.host).toBe('0.0.0.0');
      expect(loaded.appCommitSha).toBe('sha-abc1234');
    });

    it('loads default development configuration', () => {
      const configDefault = loadConfig({
        NODE_ENV: 'development',
        JWT_SECRET: validSecret
      });

      expect(configDefault.port).toBe(5000);
      expect(configDefault.host).toBe('0.0.0.0');
      expect(configDefault.clientUrl).toBe('http://localhost:5173');
      expect(configDefault.databaseUrl).toBe('');
      expect(configDefault.appCommitSha).toBe('development');
    });
  });
});
