-- Add time fields to transaction and loan payment histories.
SET NAMES utf8mb4;

ALTER TABLE transactions
    ADD COLUMN transaction_time TIME NOT NULL DEFAULT '00:00:00' AFTER transaction_date;

ALTER TABLE loan_payments
    ADD COLUMN payment_time TIME NOT NULL DEFAULT '00:00:00' AFTER payment_date;
