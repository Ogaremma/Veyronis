import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZeroAddress, id } from "ethers";
import Home from "./page";
import { AgreementReview } from "./agreement-review";

describe("agreement creation page", () => {
  it("renders policy inputs, commitment preview, and a pre-deployment review action", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("Create Agreement");
    expect(html).toContain("Expected source contract");
    expect(html).toContain("Evidence policy commitment");
    expect(html).toContain("Review Agreement");
    expect(html).not.toContain("Confirm &amp; Deploy");
    expect(html).not.toContain("private key");
    expect(html).not.toContain("seed phrase");
  });

  it("renders immutable commitments and deployment only on the confirmation step", () => {
    const html = renderToStaticMarkup(
      <AgreementReview
        draft={{
          buyer: "0x1000000000000000000000000000000000000001",
          seller: "0x2000000000000000000000000000000000000002",
          arbitrator: "0x3000000000000000000000000000000000000003",
          evidenceRegistry: "0x4000000000000000000000000000000000000004",
          requiredAmount: "100",
          agreementNonce: id("nonce"),
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
        }}
        preview={{ policy: id("policy"), agreement: id("agreement") }}
        back={() => {}}
        deploy={() => {}}
        deploying={false}
      />,
    );
    expect(html).toContain("Confirm &amp; Deploy");
    expect(html).toContain("immutable after deployment");
    expect(html).toContain("does not automatically resolve disputes");
  });
});
