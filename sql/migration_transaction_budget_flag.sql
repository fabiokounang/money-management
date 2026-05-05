-- Include expense transactions in budget "spent" totals (mirrors include_in_dashboard).
-- Run: mysql -u ... -p DB_NAME < sql/migration_transaction_budget_flag.sql

SET NAMES utf8mb4;

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS include_in_budget TINYINT(1) NOT NULL DEFAULT 1 AFTER include_in_dashboard;
