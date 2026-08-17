import { AbiCoder, ZeroAddress, id, keccak256 } from "ethers";
import { describe, expect, it } from "vitest";
import {
  computeAgreementCommitment,
  computeEvidencePolicyCommitment,
  evidencePolicySchema,
  validateAgreementDraft,
  type AgreementDraft,
  type EvidencePolicy,
} from "./index.js";

const buyer = "0x1000000000000000000000000000000000000001";
const seller = "0x2000000000000000000000000000000000000002";
const arbitrator = "0x3000000000000000000000000000000000000003";
const policy: EvidencePolicy = {
  version: 1,
  evidenceType: id("SOURCE_PAYMENT"),
  sourceChainKey: 1,
  assetKind: "native",
  expectedSourceContract: ZeroAddress,
  expectedRecipient: seller,
  expectedAsset: ZeroAddress,
  expectedSender: buyer,
  amountRule: "exact",
  amount: "100",
  minSourceBlock: "1",
  maxSourceBlock: "200",
  calldataSelector: "0x00000000",
  requireTransferEvent: false,
};
const draft: AgreementDraft = {
  buyer,
  seller,
  arbitrator,
  requiredAmount: "100",
  agreementNonce: id("nonce"),
  evidenceRegistry: "0x4000000000000000000000000000000000000004",
  policy,
};

describe("canonical agreement commitments", () => {
  it("matches an independently constructed Solidity-compatible policy encoding", () => {
    const expected = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        [
          "uint8",
          "bytes32",
          "uint64",
          "uint8",
          "address",
          "address",
          "address",
          "address",
          "uint8",
          "uint256",
          "uint64",
          "uint64",
          "bytes4",
          "bool",
        ],
        [
          1,
          policy.evidenceType,
          1,
          0,
          ZeroAddress,
          seller,
          ZeroAddress,
          buyer,
          0,
          "100",
          "1",
          "200",
          "0x00000000",
          false,
        ],
      ),
    );
    expect(computeEvidencePolicyCommitment(policy)).toBe(expected);
    expect(computeEvidencePolicyCommitment({ ...policy })).toBe(expected);
  });

  it("changes when any policy field changes", () => {
    const variants: EvidencePolicy[] = [
      { ...policy, evidenceType: id("OTHER") },
      { ...policy, sourceChainKey: 2 },
      {
        ...policy,
        assetKind: "erc20",
        expectedSourceContract: seller,
        expectedAsset: seller,
        requireTransferEvent: true,
      },
      { ...policy, expectedSourceContract: seller },
      { ...policy, expectedRecipient: buyer },
      { ...policy, expectedAsset: seller },
      { ...policy, expectedSender: seller },
      { ...policy, amountRule: "minimum" },
      { ...policy, amount: "101" },
      { ...policy, minSourceBlock: "2" },
      { ...policy, maxSourceBlock: "201" },
      { ...policy, calldataSelector: "0xa9059cbb" },
      { ...policy, requireTransferEvent: true },
    ];
    const base = computeEvidencePolicyCommitment(policy);
    expect(
      variants.every(
        (variant) => computeEvidencePolicyCommitment(variant) !== base,
      ),
    ).toBe(true);
  });

  it("validates policies and agreement role invariants", () => {
    expect(evidencePolicySchema.safeParse(policy).success).toBe(true);
    expect(() => validateAgreementDraft(draft)).not.toThrow();
    expect(() => validateAgreementDraft({ ...draft, buyer: seller })).toThrow();
    expect(() =>
      validateAgreementDraft({ ...draft, arbitrator: ZeroAddress }),
    ).toThrow();
    expect(() =>
      validateAgreementDraft({ ...draft, requiredAmount: "0" }),
    ).toThrow();
    expect(
      evidencePolicySchema.safeParse({
        ...policy,
        maxSourceBlock: "0",
        minSourceBlock: "2",
      }).success,
    ).toBe(true);
    expect(
      evidencePolicySchema.safeParse({
        ...policy,
        maxSourceBlock: "1",
        minSourceBlock: "2",
      }).success,
    ).toBe(false);
    expect(
      evidencePolicySchema.safeParse({
        ...policy,
        calldataSelector: "0x12345678",
      }).success,
    ).toBe(false);
  });

  it("binds participants, amount, policy, nonce, and registry in the agreement commitment", () => {
    const base = computeAgreementCommitment(draft);
    expect(computeAgreementCommitment({ ...draft })).toBe(base);
    expect(
      computeAgreementCommitment({ ...draft, requiredAmount: "101" }),
    ).not.toBe(base);
    expect(
      computeAgreementCommitment({ ...draft, agreementNonce: id("other") }),
    ).not.toBe(base);
  });
});
