import { describe, expect, it } from "vitest";
import { ZeroAddress, id } from "ethers";
import type { AgreementDetails } from "@veyronis/shared";
import { sellerProgressSteps } from "./seller-progress";

const detail = {
  role: "seller",
  metadata: {
    policy: {
      version: 1,
      evidenceType: id("SOURCE_PAYMENT"),
      sourceChainKey: 1,
      assetKind: "native",
      expectedSourceContract: ZeroAddress,
      expectedRecipient: "0x2000000000000000000000000000000000000002",
      expectedAsset: ZeroAddress,
      expectedSender: "0x1000000000000000000000000000000000000001",
      amountRule: "exact",
      amount: "100",
      minSourceBlock: "0",
      maxSourceBlock: "0",
      calldataSelector: "0x00000000",
      requireTransferEvent: false,
    },
    deliverables: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Delivery",
        description: "",
        required: true,
        active: true,
        position: 0,
        evidenceRequirements: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            label: "Tracking URL",
            kind: "TRACKING_URL",
            required: true,
            configuration: {},
            position: 0,
          },
        ],
      },
    ],
  },
  chain: { state: "AwaitingDelivery", withdrawalAmount: "0" },
} as unknown as AgreementDetails;

describe("seller progress", () => {
  it("derives prerequisite and settlement status from real agreement data", () => {
    const steps = sellerProgressSteps(detail, [], undefined);
    expect(steps.map((step) => step.label)).toEqual([
      "Review agreement terms",
      "Submit application work evidence",
      "Submit external transaction hash",
      "Verification and buyer acceptance",
      "Withdraw only after contract credit",
    ]);
    expect(
      steps.find((step) => step.label.includes("work evidence"))?.status,
    ).toBe("Required");
    expect(
      steps.find((step) => step.label.includes("transaction hash"))?.status,
    ).toBe("Pending");
    expect(steps.at(-1)?.status).toBe("Not available");
  });
});
