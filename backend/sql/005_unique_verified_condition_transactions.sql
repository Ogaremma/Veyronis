CREATE UNIQUE INDEX IF NOT EXISTS agreement_condition_verifications_verified_transaction_idx
ON agreement_condition_verifications (transaction_hash)
WHERE status = 'verified';
