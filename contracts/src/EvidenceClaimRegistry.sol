// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVeyronisEvidenceEscrow} from "./interfaces/IVeyronisEvidenceEscrow.sol";

contract EvidenceClaimRegistry {
    enum ConditionSubmission {
        DisputeEvidence,
        PrerequisiteRecord,
        DirectSettlement
    }

    struct Claim {
        address escrow;
        bytes32 agreementCommitment;
        bytes32 evidencePolicyCommitment;
        bytes32 evidenceCommitment;
        bytes32 evidenceType;
        uint64 sourceChainKey;
        bytes32 sourceTransactionHash;
        address subject;
    }

    error ZeroAddress();
    error UnauthorizedVerifier();
    error MalformedClaim();
    error InvalidEscrow();
    error WrongAgreement();
    error WrongEvidencePolicy();
    error WrongEvidenceCommitment();
    error WrongSubject();
    error EscrowNotDisputed(uint8 actualState);
    error EscrowNotAwaitingDelivery(uint8 actualState);
    error SettlementEvidenceAlreadyActive();
    error ClaimAlreadyConsumed(bytes32 claimId);
    error SourceEvidenceAlreadyBound(bytes32 sourceEvidenceKey, address escrow);

    event VerifiedClaimAccepted(
        bytes32 indexed claimId,
        address indexed escrow,
        bytes32 indexed evidenceCommitment,
        bytes32 sourceEvidenceKey
    );

    uint8 private constant DISPUTED_STATE = 3;
    uint8 private constant AWAITING_DELIVERY_STATE = 1;

    address public immutable authorizedVerifier;
    mapping(bytes32 => bool) public consumedClaims;
    mapping(bytes32 => address) public sourceEvidenceEscrow;

    constructor(address authorizedVerifier_) {
        if (authorizedVerifier_ == address(0)) revert ZeroAddress();
        authorizedVerifier = authorizedVerifier_;
    }

    function submitVerifiedClaim(Claim calldata claim) external returns (bytes32 claimId) {
        if (msg.sender != authorizedVerifier) revert UnauthorizedVerifier();
        claimId = _acceptVerifiedClaim(claim, DISPUTED_STATE, ConditionSubmission.DisputeEvidence);

        emit VerifiedClaimAccepted(
            claimId, claim.escrow, claim.evidenceCommitment, computeSourceEvidenceKey(claim)
        );
    }

    function submitVerifiedConditionClaim(Claim calldata claim) external returns (bytes32 claimId) {
        if (msg.sender != authorizedVerifier) revert UnauthorizedVerifier();
        claimId = _acceptVerifiedClaim(
            claim, AWAITING_DELIVERY_STATE, ConditionSubmission.DirectSettlement
        );

        emit VerifiedClaimAccepted(
            claimId, claim.escrow, claim.evidenceCommitment, computeSourceEvidenceKey(claim)
        );
    }

    function submitVerifiedPrerequisiteClaim(Claim calldata claim)
        external
        returns (bytes32 claimId)
    {
        if (msg.sender != authorizedVerifier) revert UnauthorizedVerifier();
        claimId = _acceptVerifiedClaim(
            claim, AWAITING_DELIVERY_STATE, ConditionSubmission.PrerequisiteRecord
        );

        emit VerifiedClaimAccepted(
            claimId, claim.escrow, claim.evidenceCommitment, computeSourceEvidenceKey(claim)
        );
    }

    function computeEvidenceCommitment(
        bytes32 evidencePolicyCommitment,
        bytes32 evidenceType,
        uint64 sourceChainKey,
        bytes32 sourceTransactionHash,
        address subject
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                evidencePolicyCommitment,
                evidenceType,
                sourceChainKey,
                sourceTransactionHash,
                subject
            )
        );
    }

    function computeClaimId(Claim calldata claim) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                claim.escrow,
                claim.agreementCommitment,
                claim.evidencePolicyCommitment,
                claim.evidenceCommitment,
                claim.evidenceType,
                claim.sourceChainKey,
                claim.sourceTransactionHash,
                claim.subject
            )
        );
    }

    function computeSourceEvidenceKey(Claim calldata claim) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                claim.evidenceType, claim.sourceChainKey, claim.sourceTransactionHash, claim.subject
            )
        );
    }

    function _acceptVerifiedClaim(
        Claim calldata claim,
        uint8 expectedState,
        ConditionSubmission submission
    )
        private
        returns (bytes32 claimId)
    {
        _validateNonzeroFields(claim);

        IVeyronisEvidenceEscrow escrow = IVeyronisEvidenceEscrow(claim.escrow);
        if (claim.escrow.code.length == 0) revert InvalidEscrow();
        if (escrow.agreementCommitment() != claim.agreementCommitment) {
            revert WrongAgreement();
        }
        if (escrow.evidencePolicyCommitment() != claim.evidencePolicyCommitment) {
            revert WrongEvidencePolicy();
        }
        if (
            submission == ConditionSubmission.PrerequisiteRecord
                || submission == ConditionSubmission.DirectSettlement
        ) {
            if (escrow.activeEvidenceCommitment() != bytes32(0)) {
                revert SettlementEvidenceAlreadyActive();
            }
        } else if (escrow.activeEvidenceCommitment() != claim.evidenceCommitment) {
            revert WrongEvidenceCommitment();
        }
        if (claim.subject != escrow.buyer() && claim.subject != escrow.seller()) {
            revert WrongSubject();
        }

        uint8 escrowState = escrow.state();
        if (escrowState != expectedState) {
            if (
                submission == ConditionSubmission.PrerequisiteRecord
                    || submission == ConditionSubmission.DirectSettlement
            ) revert EscrowNotAwaitingDelivery(escrowState);
            revert EscrowNotDisputed(escrowState);
        }

        bytes32 expectedEvidenceCommitment = computeEvidenceCommitment(
            claim.evidencePolicyCommitment,
            claim.evidenceType,
            claim.sourceChainKey,
            claim.sourceTransactionHash,
            claim.subject
        );
        if (expectedEvidenceCommitment != claim.evidenceCommitment) {
            revert WrongEvidenceCommitment();
        }

        claimId = computeClaimId(claim);
        if (consumedClaims[claimId]) revert ClaimAlreadyConsumed(claimId);

        bytes32 sourceEvidenceKey = computeSourceEvidenceKey(claim);
        address boundEscrow = sourceEvidenceEscrow[sourceEvidenceKey];
        if (boundEscrow != address(0)) {
            revert SourceEvidenceAlreadyBound(sourceEvidenceKey, boundEscrow);
        }

        consumedClaims[claimId] = true;
        sourceEvidenceEscrow[sourceEvidenceKey] = claim.escrow;
        if (submission == ConditionSubmission.DirectSettlement) {
            escrow.settleVerifiedCondition(claimId, claim.evidenceCommitment);
        } else if (submission == ConditionSubmission.PrerequisiteRecord) {
            escrow.recordVerifiedCondition(claimId, claim.evidenceCommitment);
        } else {
            escrow.recordVerifiedEvidence(claimId, claim.evidenceCommitment);
        }
    }

    function _validateNonzeroFields(Claim calldata claim) private pure {
        if (
            claim.escrow == address(0) || claim.agreementCommitment == bytes32(0)
                || claim.evidencePolicyCommitment == bytes32(0)
                || claim.evidenceCommitment == bytes32(0) || claim.evidenceType == bytes32(0)
                || claim.sourceChainKey == 0 || claim.sourceTransactionHash == bytes32(0)
                || claim.subject == address(0)
        ) revert MalformedClaim();
    }
}
