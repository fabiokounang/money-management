-- Add budgets.auto_renew for rolling weekly/monthly/yearly periods.
-- Run once on existing databases.

ALTER TABLE budgets
    ADD COLUMN auto_renew TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active;
