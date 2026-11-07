import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  validateAllocationLines,
  validateTransactionAmount,
  validateTransactionDate,
  ExpenseError
} from '../../src/services/expense.service.js';

describe('Unit Test: Split Allocation Engine (WP-04, Features F-05, F-06)', () => {
  const totalAmount3000 = new Prisma.Decimal('3000.00');

  describe('Allocation Balance Integrity (BR-05, BR-06, AC-06-1, AC-06-2)', () => {
    it('TEST-ALLOC-01: accepts multi-line split where allocation sum strictly equals total amount (1000.00 + 2000.00 = 3000.00)', () => {
      const allocations = [
        { target_account_id: '11111111-1111-4111-8111-111111111104', amount: 1000.00, notes: 'Dining' },
        { target_account_id: '11111111-1111-4111-8111-111111111105', amount: 2000.00, notes: 'Grocery' }
      ];

      const result = validateAllocationLines(allocations, totalAmount3000);
      expect(result).toHaveLength(2);
      expect(result[0].amountDecimal.toString()).toBe('1000');
      expect(result[1].amountDecimal.toString()).toBe('2000');
      expect(result[0].target_account_id).toBe('11111111-1111-4111-8111-111111111104');
      expect(result[1].target_account_id).toBe('11111111-1111-4111-8111-111111111105');
    });

    it('TEST-ALLOC-02: rejects unbalanced allocation sum (1000.00 + 1500.00 != 3000.00) with 422 ALLOCATION_SUM_MISMATCH', () => {
      const allocations = [
        { target_account_id: '11111111-1111-4111-8111-111111111104', amount: 1000.00, notes: 'Dining' },
        { target_account_id: '11111111-1111-4111-8111-111111111105', amount: 1500.00, notes: 'Grocery' }
      ];

      expect(() => validateAllocationLines(allocations, totalAmount3000)).toThrowError(ExpenseError);
      try {
        validateAllocationLines(allocations, totalAmount3000);
      } catch (err: any) {
        expect(err.statusCode).toBe(422);
        expect(err.code).toBe('ALLOCATION_SUM_MISMATCH');
        expect(err.message).toContain('Total amount must equal the sum of all allocation lines');
      }
    });

    it('rejects allocations sum exceeding total amount (2000.00 + 1500.00 > 3000.00) with 422 ALLOCATION_SUM_MISMATCH', () => {
      const allocations = [
        { target_account_id: '11111111-1111-4111-8111-111111111104', amount: 2000.00 },
        { target_account_id: '11111111-1111-4111-8111-111111111105', amount: 1500.00 }
      ];

      expect(() => validateAllocationLines(allocations, totalAmount3000)).toThrow(
        expect.objectContaining({
          statusCode: 422,
          code: 'ALLOCATION_SUM_MISMATCH'
        })
      );
    });

    it('prevents IEEE-754 binary floating-point representation hazards (0.10 + 0.20 === 0.30)', () => {
      const total030 = new Prisma.Decimal('0.30');
      const allocations = [
        { target_account_id: '11111111-1111-4111-8111-111111111104', amount: 0.10 },
        { target_account_id: '11111111-1111-4111-8111-111111111105', amount: 0.20 }
      ];

      const result = validateAllocationLines(allocations, total030);
      expect(result).toHaveLength(2);
      const sum = result.reduce((acc, l) => acc.add(l.amountDecimal), new Prisma.Decimal('0.00'));
      expect(sum.equals(total030)).toBe(true);
    });

    it('accepts single allocation line equal to total amount', () => {
      const allocations = [
        { target_account_id: '11111111-1111-4111-8111-111111111104', amount: 3000.00 }
      ];

      const result = validateAllocationLines(allocations, totalAmount3000);
      expect(result).toHaveLength(1);
    });

    it('accepts string formatted amounts in allocation lines', () => {
      const allocations = [
        { target_account_id: '11111111-1111-4111-8111-111111111104', amount: '1000.00' },
        { target_account_id: '11111111-1111-4111-8111-111111111105', amount: '2000.00' }
      ];

      const result = validateAllocationLines(allocations, totalAmount3000);
      expect(result).toHaveLength(2);
    });
  });

  describe('Allocation Line Syntactic & Boundary Validation', () => {
    it('rejects empty allocations array with 400 EMPTY_ALLOCATIONS', () => {
      expect(() => validateAllocationLines([], totalAmount3000)).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'EMPTY_ALLOCATIONS'
        })
      );
    });

    it('rejects non-array allocations parameter with 400 INVALID_ALLOCATIONS', () => {
      expect(() => validateAllocationLines('invalid' as any, totalAmount3000)).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_ALLOCATIONS'
        })
      );
    });

    it('rejects allocation line with missing target_account_id with 400 INVALID_ACCOUNT_ID', () => {
      const allocations = [
        { amount: 3000.00 }
      ];
      expect(() => validateAllocationLines(allocations as any, totalAmount3000)).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_ACCOUNT_ID'
        })
      );
    });

    it('rejects allocation line with malformed target_account_id UUID with 400 INVALID_ACCOUNT_ID', () => {
      const allocations = [
        { target_account_id: 'not-a-uuid', amount: 3000.00 }
      ];
      expect(() => validateAllocationLines(allocations, totalAmount3000)).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_ACCOUNT_ID'
        })
      );
    });

    it('rejects allocation line with non-positive amount (0.00) with 400 INVALID_ALLOCATION_AMOUNT', () => {
      const allocations = [
        { target_account_id: '11111111-1111-4111-8111-111111111104', amount: 0.00 },
        { target_account_id: '11111111-1111-4111-8111-111111111105', amount: 3000.00 }
      ];
      expect(() => validateAllocationLines(allocations, totalAmount3000)).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_ALLOCATION_AMOUNT'
        })
      );
    });

    it('rejects allocation line with negative amount (-50.00) with 400 INVALID_ALLOCATION_AMOUNT', () => {
      const allocations = [
        { target_account_id: '11111111-1111-4111-8111-111111111104', amount: -50.00 },
        { target_account_id: '11111111-1111-4111-8111-111111111105', amount: 3050.00 }
      ];
      expect(() => validateAllocationLines(allocations, totalAmount3000)).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_ALLOCATION_AMOUNT'
        })
      );
    });

    it('rejects allocation line with precision exceeding 2 decimal places (100.123) with 400 INVALID_ALLOCATION_AMOUNT', () => {
      const allocations = [
        { target_account_id: '11111111-1111-4111-8111-111111111104', amount: 100.123 },
        { target_account_id: '11111111-1111-4111-8111-111111111105', amount: 2899.877 }
      ];
      expect(() => validateAllocationLines(allocations, totalAmount3000)).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_ALLOCATION_AMOUNT'
        })
      );
    });

    it('rejects allocation line notes exceeding 255 characters with 400 INVALID_NOTES', () => {
      const allocations = [
        {
          target_account_id: '11111111-1111-4111-8111-111111111104',
          amount: 3000.00,
          notes: 'a'.repeat(256)
        }
      ];
      expect(() => validateAllocationLines(allocations, totalAmount3000)).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_NOTES'
        })
      );
    });
  });
});
