import { describe, it, expect } from 'vitest';
import { validateOpeningBalanceDecimal, MAX_OPENING_BALANCE } from '../../src/controllers/account.controller.js';

describe('Unit Test: Opening Balance Decimal Validation (Fix #5, AC-03-2)', () => {
  describe('Valid non-negative amounts with up to 2 decimal places', () => {
    it('accepts zero balance (0)', () => {
      const res = validateOpeningBalanceDecimal(0);
      expect(res.isValid).toBe(true);
      expect(res.decimal?.toString()).toBe('0');
    });

    it('accepts zero decimal balance (0.00)', () => {
      const res = validateOpeningBalanceDecimal(0.00);
      expect(res.isValid).toBe(true);
      expect(res.decimal?.toString()).toBe('0');
    });

    it('accepts typical currency value with 2 decimals (100.12)', () => {
      const res = validateOpeningBalanceDecimal(100.12);
      expect(res.isValid).toBe(true);
      expect(res.decimal?.toString()).toBe('100.12');
    });

    it('accepts typical currency value with 1 decimal (100.5)', () => {
      const res = validateOpeningBalanceDecimal(100.5);
      expect(res.isValid).toBe(true);
      expect(res.decimal?.toString()).toBe('100.5');
    });

    it('accepts standard opening balance (10000.00)', () => {
      const res = validateOpeningBalanceDecimal(10000.00);
      expect(res.isValid).toBe(true);
      expect(res.decimal?.toString()).toBe('10000');
    });

    it('accepts maximum allowed value for DECIMAL(12,2) (9999999999.99)', () => {
      const res = validateOpeningBalanceDecimal(9999999999.99);
      expect(res.isValid).toBe(true);
      expect(res.decimal?.equals(MAX_OPENING_BALANCE)).toBe(true);
    });
  });

  describe('Invalid precision / over-precision rejection (never silently rounded)', () => {
    it('rejects precision exceeding 2 decimal places (100.123)', () => {
      const res = validateOpeningBalanceDecimal(100.123);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('at most 2 decimal places');
    });

    it('rejects micro-precision amounts (1e-7)', () => {
      const res = validateOpeningBalanceDecimal(1e-7);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('at most 2 decimal places');
    });

    it('rejects 3-decimal fraction (0.001)', () => {
      const res = validateOpeningBalanceDecimal(0.001);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('at most 2 decimal places');
    });
  });

  describe('Invalid negative and out-of-range rejection', () => {
    it('rejects negative amount (-500.00)', () => {
      const res = validateOpeningBalanceDecimal(-500.00);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('cannot be negative');
    });

    it('rejects negative fractional amount (-0.01)', () => {
      const res = validateOpeningBalanceDecimal(-0.01);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('cannot be negative');
    });

    it('rejects value exceeding maximum allowed DECIMAL(12,2) (10000000000.00)', () => {
      const res = validateOpeningBalanceDecimal(10000000000.00);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('exceeds maximum allowed limit');
    });

    it('rejects extreme large value (99999999999)', () => {
      const res = validateOpeningBalanceDecimal(99999999999);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('exceeds maximum allowed limit');
    });
  });

  describe('Invalid data types and non-finite values', () => {
    it('rejects string values ("10000")', () => {
      const res = validateOpeningBalanceDecimal('10000');
      expect(res.isValid).toBe(false);
    });

    it('rejects null and undefined', () => {
      expect(validateOpeningBalanceDecimal(null).isValid).toBe(false);
      expect(validateOpeningBalanceDecimal(undefined).isValid).toBe(false);
    });

    it('rejects NaN and Infinity', () => {
      expect(validateOpeningBalanceDecimal(NaN).isValid).toBe(false);
      expect(validateOpeningBalanceDecimal(Infinity).isValid).toBe(false);
      expect(validateOpeningBalanceDecimal(-Infinity).isValid).toBe(false);
    });
  });
});
