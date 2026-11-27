-- Deterministic audit event ordering (F-16 / F-18).
--
-- Random UUID `id` and same-millisecond `created_at` values cannot encode the commit order of serialized
-- corrections. `sequence_number` is a database-allocated monotonic BIGSERIAL that is assigned while the
-- corrected `transactions` row is held FOR UPDATE, therefore for a single transaction_id the ascending
-- `sequence_number` order is exactly the lock-acquisition / commit order (and the previous_snapshot of event N+1
-- equals the new_snapshot of event N).
--
-- ADD COLUMN ... BIGSERIAL assigns values to pre-existing rows during the table rewrite (in physical insertion
-- order of the append-only table) WITHOUT firing the BEFORE UPDATE immutability trigger.

-- AlterTable
ALTER TABLE "transaction_audit_logs" ADD COLUMN "sequence_number" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "transaction_audit_logs_sequence_number_key" ON "transaction_audit_logs"("sequence_number");

-- CreateIndex
CREATE INDEX "transaction_audit_logs_transaction_id_sequence_number_idx" ON "transaction_audit_logs"("transaction_id", "sequence_number" DESC);
