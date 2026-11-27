-- Pre-Migration Safety Check: Verify no existing user accounts collide after case-insensitive and whitespace normalization.
-- Never automatically deletes or renames user accounts; aborts cleanly with an explicit report if duplicates exist.
CREATE OR REPLACE FUNCTION check_pre_migration_account_name_collisions()
RETURNS VOID AS $$
DECLARE
  v_conflict RECORD;
BEGIN
  SELECT
    "user_id",
    LOWER(REGEXP_REPLACE(BTRIM("name"), '\s+', ' ', 'g')) AS norm_name,
    COUNT(*) AS cnt,
    STRING_AGG("name", ', ' ORDER BY "created_at", "id") AS conflicting_names
  INTO v_conflict
  FROM "accounts"
  GROUP BY "user_id", LOWER(REGEXP_REPLACE(BTRIM("name"), '\s+', ' ', 'g'))
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Pre-migration check failed: duplicate normalized account names detected for user_id=% (normalized="%", count=%, existing names=[%]). Manual review required without auto-renaming or deleting user data.',
      v_conflict."user_id", v_conflict.norm_name, v_conflict.cnt, v_conflict.conflicting_names
      USING ERRCODE = '23505';
  END IF;
END;
$$ LANGUAGE plpgsql;

SELECT check_pre_migration_account_name_collisions();

-- CreateEnum
CREATE TYPE "AccountSubtype" AS ENUM ('DEFAULT', 'CREDIT_CARD', 'GENERAL_LOAN');

-- AlterTable: Add Sprint 2 & Sprint 3 columns to accounts
ALTER TABLE "accounts"
    ADD COLUMN "normalized_name" VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN "subtype" "AccountSubtype" NOT NULL DEFAULT 'DEFAULT',
    ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- Backfill normalized_name unconditionally from name for all existing rows
UPDATE "accounts"
SET "normalized_name" = LOWER(REGEXP_REPLACE(BTRIM("name"), '\s+', ' ', 'g'));

-- Deterministic LOAN_TAKEN Subtype Backfill (ARCH-S2-01 / BR-07 v1.1 Prerequisite):
-- Evaluates legacy LOAN_TAKEN rows whose subtype is still 'DEFAULT' across 5 deterministic cases:
--   Case 1 (Credit Card Purchase History): LOAN_TAKEN account with direct PAYMENT_CHARGE transactions
--          (primary_account_id = account.id AND form = 'PAYMENT_CHARGE') -> classified as CREDIT_CARD.
--   Case 2 (General Loan Borrowing History): LOAN_TAKEN account with RECEIVE_MONEY borrowing allocations
--          from a CASH primary account and zero direct PAYMENT_CHARGE purchases -> classified as GENERAL_LOAN.
--   Case 3 (No Transaction History on Legacy Account): LOAN_TAKEN account with subtype = 'DEFAULT' and zero
--          transactions (e.g., seeded Visa Credit Card) -> classified to default legacy subtype CREDIT_CARD.
--   Case 4 (Already Explicitly Assigned Subtype): LOAN_TAKEN account where subtype is already 'CREDIT_CARD'
--          or 'GENERAL_LOAN' -> preserved untouched (never overwritten).
--   Case 5 (Mixed Transaction History): LOAN_TAKEN account with both direct PAYMENT_CHARGE purchase charges
--          and RECEIVE_MONEY borrowing allocations -> deterministically classified as CREDIT_CARD so credit-card
--          BR-07 v1.1 repayment rules remain enforced on any account with direct credit card purchase charges.
CREATE OR REPLACE FUNCTION backfill_loan_taken_subtypes()
RETURNS VOID AS $$
BEGIN
  -- Case 2: Classify legacy (subtype = 'DEFAULT') LOAN_TAKEN accounts with general borrowing inflows
  -- and zero direct purchase charges as GENERAL_LOAN (Case 4 explicit subtypes and Case 5 mixed history are excluded)
  UPDATE "accounts" a
  SET "subtype" = 'GENERAL_LOAN'
  WHERE a."type" = 'LOAN_TAKEN'
    AND a."subtype" = 'DEFAULT'
    AND EXISTS (
      SELECT 1
      FROM "allocation_lines" al
      JOIN "transactions" t ON t."id" = al."transaction_id"
      JOIN "accounts" p ON p."id" = t."primary_account_id"
      WHERE al."target_account_id" = a."id"
        AND t."form" = 'RECEIVE_MONEY'
        AND p."type" = 'CASH'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "transactions" t2
      WHERE t2."primary_account_id" = a."id"
        AND t2."form" = 'PAYMENT_CHARGE'
    );

  -- Cases 1, 3, and 5: All remaining legacy (subtype = 'DEFAULT') LOAN_TAKEN accounts
  -- (credit card purchase history, mixed history, or zero-transaction legacy accounts) become CREDIT_CARD
  UPDATE "accounts" a
  SET "subtype" = 'CREDIT_CARD'
  WHERE a."type" = 'LOAN_TAKEN'
    AND a."subtype" = 'DEFAULT';

  -- Ensure non-LOAN_TAKEN accounts strictly retain DEFAULT subtype
  UPDATE "accounts"
  SET "subtype" = 'DEFAULT'
  WHERE "type" <> 'LOAN_TAKEN' AND "subtype" <> 'DEFAULT';
END;
$$ LANGUAGE plpgsql;

SELECT backfill_loan_taken_subtypes();

-- Trigger to unconditionally compute normalized_name from NEW.name on every INSERT or UPDATE,
-- and preserve explicit GENERAL_LOAN / CREDIT_CARD subtypes while defaulting omitted LOAN_TAKEN subtype to CREDIT_CARD
CREATE OR REPLACE FUNCTION sync_account_normalized_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW."normalized_name" := LOWER(REGEXP_REPLACE(BTRIM(COALESCE(NEW."name", '')), '\s+', ' ', 'g'));
  IF NEW."type" = 'LOAN_TAKEN' THEN
    IF NEW."subtype" IS NULL OR NEW."subtype" = 'DEFAULT' THEN
      NEW."subtype" := 'CREDIT_CARD';
    END IF;
  ELSE
    NEW."subtype" := 'DEFAULT';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accounts_sync_normalized_name
BEFORE INSERT OR UPDATE ON "accounts"
FOR EACH ROW EXECUTE FUNCTION sync_account_normalized_name();

-- CreateIndex: Unique constraint on (user_id, normalized_name) and functional expression unique index
CREATE UNIQUE INDEX "accounts_user_id_normalized_name_key" ON "accounts"("user_id", "normalized_name");
CREATE UNIQUE INDEX "accounts_user_id_normalized_name_expr_idx" ON "accounts"("user_id", LOWER(REGEXP_REPLACE(BTRIM("name"), '\s+', ' ', 'g')));

-- AlterTable: Add Sprint 2 columns to transactions
ALTER TABLE "transactions"
    ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable: transaction_audit_logs (F-16, F-18) with onDelete: Restrict
CREATE TABLE "transaction_audit_logs" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL DEFAULT 'CORRECTED',
    "previous_snapshot" JSONB NOT NULL,
    "new_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_audit_logs_transaction_id_created_at_id_idx" ON "transaction_audit_logs"("transaction_id", "created_at" DESC, "id" DESC);
CREATE INDEX "transaction_audit_logs_user_id_idx" ON "transaction_audit_logs"("user_id");

-- AddForeignKey (onDelete: Restrict to protect audit history from parent Transaction deletion)
ALTER TABLE "transaction_audit_logs"
    ADD CONSTRAINT "transaction_audit_logs_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutability Trigger on transaction_audit_logs (Defense-in-Depth Layer 3)
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TransactionAuditLog is append-only and immutable: % operations are prohibited', TG_OP
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_audit_logs_immutable
BEFORE UPDATE OR DELETE ON "transaction_audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
