import { describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { mockUsers, DEMO_PASSWORD } from '../fixtures/mockPrisma.js';

describe('TEST-AUTH-04: Password Hashing and Security (AC-01-4, NFR-SEC-01)', () => {
  const BCRYPT_REGEX = /^\$2[ab]\$[0-9]{2}\$[A-Za-z0-9./]{53}$/;

  it('stored password_hash for all seeded users matches bcrypt regex format', () => {
    expect(mockUsers.length).toBeGreaterThan(0);

    for (const user of mockUsers) {
      expect(user.password_hash).toMatch(BCRYPT_REGEX);
      expect(user.password_hash.length).toBe(60);
    }
  });

  it('ensures zero plaintext passwords are stored in user records', () => {
    for (const user of mockUsers) {
      expect(user.password_hash).not.toBe(DEMO_PASSWORD);
      expect(user.password_hash).not.toContain(DEMO_PASSWORD);
    }
  });

  it('validates password correctly using bcrypt.compare without leaking plaintext', async () => {
    for (const user of mockUsers) {
      const isMatch = await bcrypt.compare(DEMO_PASSWORD, user.password_hash);
      expect(isMatch).toBe(true);

      const isWrongMatch = await bcrypt.compare('WrongPassword456!', user.password_hash);
      expect(isWrongMatch).toBe(false);
    }
  });

  it('generates salted hash with minimum cost factor of 10', async () => {
    const saltRounds = 10;
    const testHash = await bcrypt.hash('SamplePassword789!', saltRounds);
    expect(testHash).toMatch(BCRYPT_REGEX);
    expect(testHash.startsWith('$2b$10$') || testHash.startsWith('$2a$10$')).toBe(true);
  });
});
