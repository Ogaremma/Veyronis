import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZeroAddress, id } from "ethers";
import Home from "./page";
import { AgreementReview } from "./agreement-review";
import { Web3Provider } from "./web3-provider";

describe("Veyronis frontend", () => {
  it("starts with connected-wallet onboarding without seed creation", () => {
    const html = renderToStaticMarkup(<Web3Provider><Home /></Web3Provider>);
    expect(html).toContain("Trust between strangers, backed by verifiable evidence.");
    expect(html).toContain("Connect wallet");
    expect(html).toContain("WalletConnect");
    expect(html).not.toContain("Confirm &amp; Deploy");
    expect(html).toContain("never receives your private keys or recovery phrase");
    expect(html).not.toContain("Create a new wallet");
    expect(html).not.toContain("Enter your recovery phrase");
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
