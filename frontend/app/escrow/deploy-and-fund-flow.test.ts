import { describe, expect, it, vi } from "vitest";
import type {
  AgreementDetails,
  AgreementMetadata,
  TransactionReceiptInfo,
} from "@veyronis/shared";
import { deployAndFundAgreement } from "./deploy-and-fund-flow";

const deployed = {
  id: "0x1000000000000000000000000000000000000000000000000000000000000001",
  escrowAddress: "0x4000000000000000000000000000000000000004",
  deploymentStatus: "DEPLOYED",
} as AgreementMetadata;

function details(state: "AwaitingPayment" | "AwaitingDelivery"): AgreementDetails {
  return {
    metadata: deployed,
    role: "buyer",
    chain: {
      state,
      buyer: "0x1000000000000000000000000000000000000001",
      seller: "0x2000000000000000000000000000000000000002",
      requiredAmount: "100",
      escrowAddress: deployed.escrowAddress,
    },
    timeline: [],
    actions: [],
  } as unknown as AgreementDetails;
}

describe("deploy and fund flow", () => {
  it("preserves a deployed-but-unfunded agreement when funding is rejected", async () => {
    const createAndDeploy = vi.fn(async () => deployed);
    const getAgreement = vi.fn(async () => details("AwaitingPayment"));
    const fundEscrow = vi.fn(async (): Promise<TransactionReceiptInfo> => ({
      status: "USER_REJECTED",
      error: "The buyer rejected funding.",
    }));

    const result = await deployAndFundAgreement({
      draft: {} as never,
      createAndDeploy,
      getAgreement,
      fundEscrow,
    });

    expect(result).toMatchObject({
      agreementId: deployed.id,
      escrowAddress: deployed.escrowAddress,
      funded: false,
      state: "AwaitingPayment",
    });
    expect(fundEscrow).toHaveBeenCalledOnce();
    expect(getAgreement).toHaveBeenCalledTimes(2);
  });

  it("marks funding complete only after refreshing authoritative state", async () => {
    const createAndDeploy = vi.fn(async () => deployed);
    const getAgreement = vi.fn()
      .mockResolvedValueOnce(details("AwaitingPayment"))
      .mockResolvedValueOnce(details("AwaitingDelivery"));
    const fundEscrow = vi.fn(async (): Promise<TransactionReceiptInfo> => ({ status: "COMPLETE" }));

    const result = await deployAndFundAgreement({
      draft: {} as never,
      createAndDeploy,
      getAgreement,
      fundEscrow,
    });

    expect(result.funded).toBe(true);
    expect(result.state).toBe("AwaitingDelivery");
    expect(getAgreement).toHaveBeenCalledWith(deployed.id);
    expect(getAgreement).toHaveBeenCalledTimes(2);
  });
});
