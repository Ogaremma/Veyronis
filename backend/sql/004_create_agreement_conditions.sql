CREATE TABLE IF NOT EXISTS agreement_condition_verifications (
  id UUID PRIMARY KEY,
  agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE RESTRICT,
  submitter TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending',
    'verification_in_progress',
    'verified',
    'verification_failed'
  )),
  verified_claim_id TEXT,
  verified_amount NUMERIC(78, 0),
  failure_code TEXT,
  failure_message TEXT,
  submitted_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (agreement_id, transaction_hash)
);

CREATE INDEX IF NOT EXISTS agreement_condition_verifications_agreement_idx
  ON agreement_condition_verifications (agreement_id, submitted_at DESC);
