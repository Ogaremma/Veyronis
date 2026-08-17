CREATE TABLE IF NOT EXISTS agreements (
  id TEXT PRIMARY KEY,
  buyer TEXT NOT NULL,
  seller TEXT NOT NULL,
  arbitrator TEXT NOT NULL,
  required_amount NUMERIC(78, 0) NOT NULL,
  agreement_nonce TEXT NOT NULL,
  agreement_commitment TEXT NOT NULL UNIQUE,
  evidence_policy JSONB NOT NULL,
  evidence_policy_commitment TEXT NOT NULL,
  evidence_registry TEXT NOT NULL,
  deployment_status TEXT NOT NULL CHECK (deployment_status IN ('DRAFT','AWAITING_CONFIRMATION','DEPLOYING','DEPLOYED','FAILED')),
  escrow_address TEXT UNIQUE,
  deployment_transaction_hash TEXT,
  deployment_block_number NUMERIC(20, 0),
  deployment_error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agreements_buyer_idx ON agreements (LOWER(buyer));
CREATE INDEX IF NOT EXISTS agreements_seller_idx ON agreements (LOWER(seller));
CREATE INDEX IF NOT EXISTS agreements_arbitrator_idx ON agreements (LOWER(arbitrator));
