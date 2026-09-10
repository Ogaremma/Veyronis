import type {
  AgreementDetails,
  AgreementDraft,
  AgreementMetadata,
  EscrowState,
  TransactionReceiptInfo,
} from "@veyronis/shared";

export type DeployAndFundStage = "deploying" | "funding";

export interface DeployAndFundResult {
  agreementId: string;
  escrowAddress: string;
  funded: boolean;
  state: EscrowState | undefined;
  transaction: TransactionReceiptInfo;
  details: AgreementDetails | undefined;
}

export async function deployAndFundAgreement(input: {
  draft: AgreementDraft;
  createAndDeploy: (draft: AgreementDraft) => Promise<AgreementMetadata>;
  getAgreement: (id: string) => Promise<AgreementDetails>;
  fundEscrow: (details: AgreementDetails) => Promise<TransactionReceiptInfo>;
  onStage?: (stage: DeployAndFundStage) => void;
}): Promise<DeployAndFundResult> {
  input.onStage?.("deploying");
  const deployed = await input.createAndDeploy(input.draft);
  if (deployed.deploymentStatus !== "DEPLOYED" || !deployed.escrowAddress) {
    throw new Error("Deployment was not confirmed");
  }

  input.onStage?.("funding");
  const details = await safelyGetAgreement(input.getAgreement, deployed.id);
  let transaction: TransactionReceiptInfo;
  if (!details) {
    transaction = {
      status: "RECONCILIATION_FAILED",
      error: "The deployed agreement could not be reconciled before funding.",
    };
  } else {
    try {
      transaction = await input.fundEscrow(details);
    } catch (reason) {
      transaction = {
        status: "RPC_ERROR",
        error: reason instanceof Error ? reason.message : "Funding did not complete.",
      };
    }
  }

  const refreshed = await safelyGetAgreement(input.getAgreement, deployed.id);
  return {
    agreementId: deployed.id,
    escrowAddress: deployed.escrowAddress,
    funded:
      transaction.status === "COMPLETE" &&
      refreshed?.chain?.state === "AwaitingDelivery",
    state: refreshed?.chain?.state,
    transaction,
    details: refreshed,
  };
}

async function safelyGetAgreement(
  getAgreement: (id: string) => Promise<AgreementDetails>,
  id: string,
): Promise<AgreementDetails | undefined> {
  try {
    return await getAgreement(id);
  } catch {
    return undefined;
  }
}
