-- Adds 'debt' to transactions.transaction_type (borrowing / lending cash inflow + optional loan record).
-- Run: mysql -u ... -p DB_NAME < sql/migration_transaction_type_debt.sql

SET NAMES utf8mb4;

ALTER TABLE transactions
  MODIFY COLUMN transaction_type ENUM('income', 'expense', 'transfer', 'debt') NOT NULL;
