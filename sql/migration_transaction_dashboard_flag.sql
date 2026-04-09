-- Add per-transaction flag to include/exclude from dashboard totals.
-- Run: mysql -u ... -p DB_NAME < sql/migration_transaction_dashboard_flag.sql

SET NAMES utf8mb4;

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS include_in_dashboard TINYINT(1) NOT NULL DEFAULT 1 AFTER payment_method;
