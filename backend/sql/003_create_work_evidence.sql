CREATE TABLE IF NOT EXISTS agreement_deliverables (
  id UUID PRIMARY KEY,
  agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  required BOOLEAN NOT NULL,
  active BOOLEAN NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (agreement_id, position)
);

CREATE TABLE IF NOT EXISTS agreement_evidence_requirements (
  id UUID PRIMARY KEY,
  agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE RESTRICT,
  deliverable_id UUID NOT NULL REFERENCES agreement_deliverables(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'PHOTO',
    'FILE',
    'PDF',
    'URL',
    'GITHUB_REPOSITORY',
    'GITHUB_COMMIT',
    'TRACKING_URL',
    'RECEIPT',
    'TEXT',
    'TRANSACTION_HASH'
  )),
  required BOOLEAN NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (deliverable_id, position)
);

CREATE TABLE IF NOT EXISTS agreement_evidence_submissions (
  id UUID PRIMARY KEY,
  agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE RESTRICT,
  requirement_id UUID NOT NULL REFERENCES agreement_evidence_requirements(id) ON DELETE RESTRICT,
  submitter TEXT NOT NULL,
  value TEXT NOT NULL,
  content_hash TEXT,
  mime_type TEXT,
  byte_size NUMERIC(20, 0) CHECK (byte_size IS NULL OR byte_size >= 0),
  status TEXT NOT NULL CHECK (status IN ('submitted', 'accepted', 'rejected')),
  review_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agreement_deliverables_agreement_idx
  ON agreement_deliverables (agreement_id, position);
CREATE INDEX IF NOT EXISTS agreement_evidence_requirements_agreement_idx
  ON agreement_evidence_requirements (agreement_id, deliverable_id, position);
CREATE INDEX IF NOT EXISTS agreement_evidence_submissions_agreement_idx
  ON agreement_evidence_submissions (agreement_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS agreement_evidence_submissions_requirement_idx
  ON agreement_evidence_submissions (requirement_id);
