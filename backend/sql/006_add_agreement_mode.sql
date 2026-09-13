ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS agreement_mode TEXT;

ALTER TABLE agreement_condition_verifications
  ADD COLUMN IF NOT EXISTS verified_facts JSONB;

WITH application_work AS (
  SELECT DISTINCT deliverable.agreement_id
  FROM agreement_deliverables AS deliverable
  JOIN agreement_evidence_requirements AS requirement
    ON requirement.deliverable_id = deliverable.id
  WHERE deliverable.active
    AND requirement.kind <> 'TRANSACTION_HASH'
)
UPDATE agreements AS agreement
SET agreement_mode = CASE
  WHEN agreement.evidence_policy->>'evidenceType' = '0x077b5f41ba0bb75606c33e5fb0bc7960701513a47fb049efb90abf980fd9d011'
    AND EXISTS (
      SELECT 1
      FROM application_work AS work
      WHERE work.agreement_id = agreement.id
    )
    THEN 'hybrid'
  WHEN agreement.evidence_policy->>'evidenceType' = '0x077b5f41ba0bb75606c33e5fb0bc7960701513a47fb049efb90abf980fd9d011'
    THEN 'blockchain_condition_only'
  ELSE 'application_work_evidence'
END;

ALTER TABLE agreements
  ALTER COLUMN agreement_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agreements_agreement_mode_check'
  ) THEN
    ALTER TABLE agreements
      ADD CONSTRAINT agreements_agreement_mode_check
      CHECK (agreement_mode IN (
        'blockchain_condition_only',
        'application_work_evidence',
        'hybrid'
      ));
  END IF;
END
$$;
