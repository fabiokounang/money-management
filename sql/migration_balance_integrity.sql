-- Balance integrity links + debt cash direction.
-- Applied by scripts/run-migration-balance-integrity.js (idempotent).

-- transactions.debt_cash_effect: 'in' = cash increases, 'out' = cash decreases (lending)
-- loan_records.source_transaction_id: opening cash TX that created the loan
-- loan_payments.transaction_id: auto TX created with a payment
