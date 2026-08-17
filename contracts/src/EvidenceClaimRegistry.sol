// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVeyronisEvidenceEscrow} from "./interfaces/IVeyronisEvidenceEscrow.sol";

contract EvidenceClaimRegistry {
    struct Claim {
        address escrow;
        bytes32 agreementCommitment;
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
    error WrongEvidenceCommitment();
    error WrongSubject();
    error EscrowNotDisputed(uint8 actualState);
    error ClaimAlreadyConsumed(bytes32 claimId);
    error SourceEvidenceAlreadyBound(bytes32 sourceEvidenceKey, address escrow);

    event VerifiedClaimAccepted(
        bytes32 indexed claimId,
        address indexed escrow,
        bytes32 indexed evidenceCommitment,
        bytes32 sourceEvidenceKey
    );

    uint8 private constant DISPUTED_STATE = 3;

    address public immutable authorizedVerifier;
    mapping(bytes32 => bool) public consumedClaims;
    mapping(bytes32 => address) public sourceEvidenceEscrow;

    constructor(address authorizedVerifier_) {
        if (authorizedVerifier_ == address(0)) revert ZeroAddress();
        authorizedVerifier = authorizedVerifier_;
    }

    function submitVerifiedClaim(Claim calldata claim) external returns (bytes32 claimId) {
        if (msg.sender != authorizedVerifier) revert UnauthorizedVerifier();
        _validateNonzeroFields(claim);

        IVeyronisEvidenceEscrow escrow = IVeyronisEvidenceEscrow(claim.escrow);
        if (claim.escrow.code.length == 0) revert InvalidEscrow();
        if (escrow.agreementCommitment() != claim.agreementCommitment) revert WrongAgreement();
        if (escrow.activeEvidenceCommitment() != claim.evidenceCommitment) {
            revert WrongEvidenceCommitment();
        }
        if (claim.subject != escrow.buyer() && claim.subject != escrow.seller()) {
            revert WrongSubject();
        }

        uint8 escrowState = escrow.state();
        if (escrowState != DISPUTED_STATE) revert EscrowNotDisputed(escrowState);

        bytes32 expectedEvidenceCommitment = computeEvidenceCommitment(
            claim.evidenceType, claim.sourceChainKey, claim.sourceTransactionHash, claim.subject
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
        escrow.recordVerifiedEvidence(claimId, claim.evidenceCommitment);

        emit VerifiedClaimAccepted(
            claimId, claim.escrow, claim.evidenceCommitment, sourceEvidenceKey
        );
    }

    function computeEvidenceCommitment(
        bytes32 evidenceType,
        uint64 sourceChainKey,
        bytes32 sourceTransactionHash,
        address subject
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(evidenceType, sourceChainKey, sourceTransactionHash, subject));
    }

    function computeClaimId(Claim calldata claim) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                claim.escrow,
                claim.agreementCommitment,
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

    function _validateNonzeroFields(Claim calldata claim) private pure {
        if (
            claim.escrow == address(0) || claim.agreementCommitment == bytes32(0)
                || claim.evidenceCommitment == bytes32(0) || claim.evidenceType == bytes32(0)
                || claim.sourceChainKey == 0 || claim.sourceTransactionHash == bytes32(0)
                || claim.subject == address(0)
        ) revert MalformedClaim();
    }
}
