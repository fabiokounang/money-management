-- Money Management — MySQL schema aligned with models/seed (InnoDB, utf8mb4).
-- Apply once per environment: mysql -u ... -p DB_NAME < sql/schema.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS monthly_income_plans;
DROP TABLE IF EXISTS recurring_schedules;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS subcategories;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    category_type ENUM('income', 'expense') NOT NULL,
    icon VARCHAR(20) NULL,
    color VARCHAR(30) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categories_user_name_type (user_id, category_name, category_type),
    KEY idx_categories_user_type_active (user_id, category_type, is_active),
    CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subcategories (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_id INT UNSIGNED NOT NULL,
    subcategory_name VARCHAR(100) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_subcategories_category_name (category_id, subcategory_name),
    KEY idx_subcategories_category_active (category_id, is_active),
    CONSTRAINT fk_subcategories_category FOREIGN KEY (category_id) REFERENCES categories (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE accounts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_type ENUM('cash', 'bank', 'ewallet', 'other') NOT NULL,
    opening_balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    current_balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    account_color VARCHAR(30) NULL,
    note VARCHAR(500) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_accounts_user_name (user_id, account_name),
    KEY idx_accounts_user_active (user_id, is_active),
    CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE transactions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type ENUM('income', 'expense', 'transfer') NOT NULL,
    amount DECIMAL(18, 2) NOT NULL,
    category_id INT UNSIGNED NULL,
    subcategory_id INT UNSIGNED NULL,
    account_id INT UNSIGNED NOT NULL,
    transfer_to_account_id INT UNSIGNED NULL,
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
    KEY idx_tx_user_date (user_id, transaction_date),
    KEY idx_tx_user_category (user_id, category_id),
    KEY idx_tx_account (user_id, account_id),
    KEY idx_tx_transfer_to (user_id, transfer_to_account_id),
    CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES accounts (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_transactions_transfer_to FOREIGN KEY (transfer_to_account_id) REFERENCES accounts (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_transactions_category FOREIGN KEY (category_id) REFERENCES categories (id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_transactions_subcategory FOREIGN KEY (subcategory_id) REFERENCES subcategories (id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recurring_schedules (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
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
    KEY idx_recurring_user_due (user_id, next_due_date, is_active),
    CONSTRAINT fk_recurring_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_recurring_account FOREIGN KEY (account_id) REFERENCES accounts (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_recurring_transfer_to FOREIGN KEY (transfer_to_account_id) REFERENCES accounts (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_recurring_category FOREIGN KEY (category_id) REFERENCES categories (id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_recurring_subcategory FOREIGN KEY (subcategory_id) REFERENCES subcategories (id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE budgets (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    amount DECIMAL(18, 2) NOT NULL,
    period_type ENUM('weekly', 'monthly', 'yearly', 'custom') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    note VARCHAR(1000) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_budgets_user_dates (user_id, start_date, end_date),
    KEY idx_budgets_user_category (user_id, category_id),
    CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES categories (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE monthly_income_plans (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    plan_month DATE NOT NULL COMMENT 'First day of calendar month (YYYY-MM-01)',
    planned_income DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_monthly_income_user_month (user_id, plan_month),
    KEY idx_monthly_income_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
