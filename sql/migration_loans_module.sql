-- Lightweight receivable/payable module.
-- Run: mysql -u ... -p DB_NAME < sql/migration_loans_module.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS loan_records (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    loan_type ENUM('receivable', 'payable') NOT NULL,
    counterparty_name VARCHAR(120) NOT NULL,
    principal_amount DECIMAL(18, 2) NOT NULL,
    outstanding_amount DECIMAL(18, 2) NOT NULL,
    start_date DATE NOT NULL,
    due_date DATE NULL,
    status ENUM('open', 'settled', 'overdue') NOT NULL DEFAULT 'open',
    reminder_days INT UNSIGNED NOT NULL DEFAULT 0,
    note VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_loans_user_status_due (user_id, status, due_date),
    KEY idx_loans_user_type (user_id, loan_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_payments (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    loan_id INT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    payment_date DATE NOT NULL,
    amount DECIMAL(18, 2) NOT NULL,
    note VARCHAR(300) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_loan_payments_loan_date (loan_id, payment_date),
    KEY idx_loan_payments_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
