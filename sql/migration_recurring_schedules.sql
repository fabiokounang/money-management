-- Add recurring_schedules for existing databases (run once).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS recurring_schedules (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(200) NULL,
    interval_months INT UNSIGNED NOT NULL DEFAULT 1,
    next_due_date DATE NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    transaction_type ENUM('income', 'expense', 'transfer') NOT NULL,
    amount DECIMAL(18, 2) NOT NULL,
    account_id INT UNSIGNED NOT NULL,
    transfer_to_account_id INT UNSIGNED NULL,
    category_id INT UNSIGNED NULL,
    subcategory_id INT UNSIGNED NULL,
    payment_method ENUM(
        'cash',
        'bank_transfer',
        'debit_card',
        'credit_card',
        'qris',
        'ewallet',
        'other'
    ) NOT NULL,
    description VARCHAR(500) NULL,
    reference_no VARCHAR(100) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_recurring_user_due (user_id, next_due_date, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
