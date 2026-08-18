CREATE TABLE IF NOT EXISTS agreement_reconciliations (
  id BIGSERIAL PRIMARY KEY,
  agreement_id TEXT NOT NULL REFERENCES agreements(id),
  status TEXT NOT NULL CHECK (status IN ('MATCHED', 'METADATA_STALE')),
  authoritative_source TEXT NOT NULL CHECK (authoritative_source = 'BLOCKCHAIN'),
  mismatches JSONB NOT NULL,
  checked_at_block NUMERIC(20, 0) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agreement_reconciliations_agreement_idx
  ON agreement_reconciliations (agreement_id, created_at DESC);
