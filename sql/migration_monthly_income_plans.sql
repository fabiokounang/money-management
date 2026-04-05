-- Planned monthly income target (per user, per calendar month).
-- Apply: mysql -u ... -p DB_NAME < sql/migration_monthly_income_plans.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS monthly_income_plans (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    plan_month DATE NOT NULL COMMENT 'First day of calendar month (YYYY-MM-01)',
    planned_income DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_monthly_income_user_month (user_id, plan_month),
    KEY idx_monthly_income_user (user_id),
    CONSTRAINT fk_monthly_income_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
