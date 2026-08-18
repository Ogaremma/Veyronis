import type { AgreementMetadata, DeploymentStatus } from "@veyronis/shared";

export interface AgreementRepository {
  createAgreement(agreement: AgreementMetadata): Promise<void>;
  getAgreementById(id: string): Promise<AgreementMetadata | undefined>;
  getAgreementByEscrowAddress(
    address: string,
  ): Promise<AgreementMetadata | undefined>;
  updateDeploymentStatus(
    id: string,
    update: {
      status: DeploymentStatus;
      escrowAddress?: string;
      transactionHash?: string;
      blockNumber?: string;
      error?: string;
    },
  ): Promise<void>;
  listAgreementsForParticipant(address: string): Promise<AgreementMetadata[]>;
  recordReconciliation(record: {
    agreementId: string;
    status: "MATCHED" | "METADATA_STALE";
    authoritativeSource: "BLOCKCHAIN";
    mismatches: string[];
    checkedAtBlock: string;
  }): Promise<void>;
}

export class InMemoryAgreementRepository implements AgreementRepository {
  private readonly agreements = new Map<string, AgreementMetadata>();

  async createAgreement(agreement: AgreementMetadata): Promise<void> {
    if (this.agreements.has(agreement.id))
      throw new Error("Agreement metadata already exists");
    this.agreements.set(agreement.id, structuredClone(agreement));
  }

  async getAgreementById(id: string): Promise<AgreementMetadata | undefined> {
    const value = this.agreements.get(id);
    return value ? structuredClone(value) : undefined;
  }

  async getAgreementByEscrowAddress(
    address: string,
  ): Promise<AgreementMetadata | undefined> {
    return [...this.agreements.values()].find(
      (agreement) =>
        agreement.escrowAddress?.toLowerCase() === address.toLowerCase(),
    );
  }

  async updateDeploymentStatus(
    id: string,
    update: Parameters<AgreementRepository["updateDeploymentStatus"]>[1],
  ): Promise<void> {
    const current = this.agreements.get(id);
    if (!current) throw new Error("Agreement metadata not found");
    this.agreements.set(id, {
      ...current,
      deploymentStatus: update.status,
      escrowAddress: update.escrowAddress ?? current.escrowAddress,
      deploymentTransactionHash:
        update.transactionHash ?? current.deploymentTransactionHash,
      deploymentBlockNumber:
        update.blockNumber ?? current.deploymentBlockNumber,
      deploymentError: update.error,
      updatedAt: new Date().toISOString(),
    });
  }

  async listAgreementsForParticipant(
    address: string,
  ): Promise<AgreementMetadata[]> {
    const normalized = address.toLowerCase();
    return [...this.agreements.values()]
      .filter((agreement) =>
        [agreement.buyer, agreement.seller, agreement.arbitrator].some(
          (participant) => participant.toLowerCase() === normalized,
        ),
      )
      .map((agreement) => structuredClone(agreement));
  }

  async recordReconciliation(): Promise<void> {}
}

export interface ParameterizedQueryExecutor {
  query<T>(text: string, values: readonly unknown[]): Promise<{ rows: T[] }>;
}

/** PostgreSQL adapter. The injected executor may be a pg Pool; all values remain parameterized. */
export class SqlAgreementRepository implements AgreementRepository {
  constructor(private readonly database: ParameterizedQueryExecutor) {}

  async createAgreement(agreement: AgreementMetadata): Promise<void> {
    await this.database.query(
      `INSERT INTO agreements
       (id, buyer, seller, arbitrator, required_amount, agreement_nonce, agreement_commitment,
        evidence_policy, evidence_policy_commitment, evidence_registry, deployment_status,
        escrow_address, deployment_transaction_hash, deployment_block_number, deployment_error,
        created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        agreement.id,
        agreement.buyer,
        agreement.seller,
        agreement.arbitrator,
        agreement.requiredAmount,
        agreement.agreementNonce,
        agreement.agreementCommitment,
        JSON.stringify(agreement.policy),
        agreement.evidencePolicyCommitment,
        agreement.evidenceRegistry,
        agreement.deploymentStatus,
        agreement.escrowAddress ?? null,
        agreement.deploymentTransactionHash ?? null,
        agreement.deploymentBlockNumber ?? null,
        agreement.deploymentError ?? null,
        agreement.createdAt,
        agreement.updatedAt,
      ],
    );
  }

  async getAgreementById(id: string): Promise<AgreementMetadata | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      "SELECT * FROM agreements WHERE id = $1 LIMIT 1",
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async getAgreementByEscrowAddress(
    address: string,
  ): Promise<AgreementMetadata | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      "SELECT * FROM agreements WHERE LOWER(escrow_address) = LOWER($1) LIMIT 1",
      [address],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async updateDeploymentStatus(
    id: string,
    update: Parameters<AgreementRepository["updateDeploymentStatus"]>[1],
  ): Promise<void> {
    await this.database.query(
      `UPDATE agreements SET deployment_status=$2, escrow_address=COALESCE($3,escrow_address),
       deployment_transaction_hash=COALESCE($4,deployment_transaction_hash),
       deployment_block_number=COALESCE($5,deployment_block_number), deployment_error=$6,
       updated_at=$7 WHERE id=$1`,
      [
        id,
        update.status,
        update.escrowAddress ?? null,
        update.transactionHash ?? null,
        update.blockNumber ?? null,
        update.error ?? null,
        new Date().toISOString(),
      ],
    );
  }

  async listAgreementsForParticipant(
    address: string,
  ): Promise<AgreementMetadata[]> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT * FROM agreements WHERE LOWER(buyer)=LOWER($1) OR LOWER(seller)=LOWER($1)
       OR LOWER(arbitrator)=LOWER($1) ORDER BY created_at DESC`,
      [address],
    );
    return result.rows.map(mapRow);
  }

  async recordReconciliation(record: Parameters<AgreementRepository["recordReconciliation"]>[0]): Promise<void> {
    await this.database.query(
      `INSERT INTO agreement_reconciliations
       (agreement_id,status,authoritative_source,mismatches,checked_at_block,created_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
      [record.agreementId, record.status, record.authoritativeSource, JSON.stringify(record.mismatches), record.checkedAtBlock, new Date().toISOString()],
    );
  }
}

function mapRow(row: Record<string, unknown>): AgreementMetadata {
  return {
    id: String(row.id),
    buyer: String(row.buyer),
    seller: String(row.seller),
    arbitrator: String(row.arbitrator),
    requiredAmount: String(row.required_amount),
    agreementNonce: String(row.agreement_nonce),
    agreementCommitment: String(row.agreement_commitment),
    evidencePolicyCommitment: String(row.evidence_policy_commitment),
    evidenceRegistry: String(row.evidence_registry),
    policy: row.evidence_policy as AgreementMetadata["policy"],
    deploymentStatus:
      row.deployment_status as AgreementMetadata["deploymentStatus"],
    escrowAddress: optionalString(row.escrow_address),
    deploymentTransactionHash: optionalString(row.deployment_transaction_hash),
    deploymentBlockNumber: optionalString(row.deployment_block_number),
    deploymentError: optionalString(row.deployment_error),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

const optionalString = (value: unknown) =>
  value == null ? undefined : String(value);
