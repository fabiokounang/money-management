-- Add username support for register/login.
-- Run: mysql -u ... -p DB_NAME < sql/migration_usernames.sql

SET NAMES utf8mb4;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS username VARCHAR(30) NULL AFTER full_name;

UPDATE users
SET username = LOWER(
    CONCAT(
        REPLACE(SUBSTRING_INDEX(email, '@', 1), ' ', ''),
        '_',
        id
    )
)
WHERE username IS NULL OR username = '';

ALTER TABLE users
    MODIFY COLUMN username VARCHAR(30) NOT NULL;

ALTER TABLE users
    ADD UNIQUE KEY uq_users_username (username);
