-- Migration: Add token_version column for JWT revocation
-- Date: 2026-08-06

ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1 AFTER is_active;

-- Verify the column was added
DESCRIBE users;