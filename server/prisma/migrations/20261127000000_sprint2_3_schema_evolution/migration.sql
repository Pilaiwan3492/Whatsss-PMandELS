-- CreateEnum
CREATE TYPE "AccountSubtype" AS ENUM ('DEFAULT', 'CREDIT_CARD', 'GENERAL_LOAN');

-- AlterTable: Add Sprint 2 & Sprint 3 columns to accounts
ALTER TABLE "accounts"
    ADD COLUMN "normalized_name" VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN "subtype" "AccountSubtype" NOT NULL DEFAULT 'DEFAULT',
    ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- Backfill normalized_name and subtype for existing rows
UPDATE "accounts"
SET "normalized_name" = LOWER(REGEXP_REPLACE(BTRIM("name"), '\s+', ' ', 'g'));

UPDATE "accounts"
SET "subtype" = 'CREDIT_CARD'
WHERE "type" = 'LOAN_TAKEN' AND LOWER(BTRIM("name")) LIKE '%credit%';

-- Trigger to automatically populate normalized_name (and default LOAN_TAKEN subtype to CREDIT_CARD when omitted) on INSERT/UPDATE
CREATE OR REPLACE FUNCTION sync_account_normalized_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."normalized_name" IS NULL OR BTRIM(NEW."normalized_name") = '' THEN
    NEW."normalized_name" := LOWER(REGEXP_REPLACE(BTRIM(NEW."name"), '\s+', ' ', 'g'));
  END IF;
  IF NEW."type" = 'LOAN_TAKEN' AND (NEW."subtype" IS NULL OR NEW."subtype" = 'DEFAULT') THEN
    NEW."subtype" := 'CREDIT_CARD';
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
