import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { validateJwtSecret, loadConfig } from '../../src/config/env.js';

describe('Unit Test: Environment Configuration & JWT Secret Security (Section 2.1)', () => {
  it('throws a fatal error if JWT_SECRET is missing in production or development', () => {
    expect(() => validateJwtSecret('', 'production')).toThrow(/FATAL: JWT_SECRET environment variable is missing/);
    expect(() => validateJwtSecret(undefined, 'development')).toThrow(/FATAL: JWT_SECRET environment variable is missing/);
  });

  it('throws a fatal error if JWT_SECRET is shorter than 32 characters', () => {
    const shortSecret = 'short_insecure_secret_123';
    expect(() => validateJwtSecret(shortSecret, 'production')).toThrow(/FATAL: JWT_SECRET must be at least 32 characters long/);
    expect(() => validateJwtSecret(shortSecret, 'development')).toThrow(/FATAL: JWT_SECRET must be at least 32 characters long/);
  });

  it('accepts and initializes successfully when a valid secret (>= 32 chars) is provided', () => {
    const validSecret = 'valid_cryptographic_secret_with_sufficient_length_2026';
    const result = validateJwtSecret(validSecret, 'production');
    expect(result).toBe(validSecret);

    const loaded = loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: validSecret,
      CLIENT_URL: 'http://localhost:5173',
      PORT: '5000'
    });
    expect(loaded.jwtSecret).toBe(validSecret);
    expect(loaded.isProduction).toBe(true);
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
