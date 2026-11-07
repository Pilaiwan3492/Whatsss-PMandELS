-- CreateEnum
CREATE TYPE "TransactionForm" AS ENUM ('PAYMENT_CHARGE', 'RECEIVE_MONEY');

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "primary_account_id" TEXT NOT NULL,
    "form" "TransactionForm" NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "transaction_date" DATE NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transactions_total_amount_check" CHECK ("total_amount" > 0.00)
);

-- CreateTable
CREATE TABLE "allocation_lines" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "target_account_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" VARCHAR(255),

    CONSTRAINT "allocation_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "allocation_lines_amount_check" CHECK ("amount" > 0.00)
);

-- CreateIndex
CREATE INDEX "transactions_user_id_transaction_date_idx" ON "transactions"("user_id", "transaction_date");

-- CreateIndex
CREATE INDEX "transactions_primary_account_id_idx" ON "transactions"("primary_account_id");

-- CreateIndex
CREATE INDEX "allocation_lines_transaction_id_idx" ON "allocation_lines"("transaction_id");

-- CreateIndex
CREATE INDEX "allocation_lines_target_account_id_idx" ON "allocation_lines"("target_account_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_primary_account_id_fkey" FOREIGN KEY ("primary_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_lines" ADD CONSTRAINT "allocation_lines_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_lines" ADD CONSTRAINT "allocation_lines_target_account_id_fkey" FOREIGN KEY ("target_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
