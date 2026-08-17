// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVeyronisEvidenceEscrow {
    function buyer() external view returns (address);
    function seller() external view returns (address);
    function agreementCommitment() external view returns (bytes32);
    function evidencePolicyCommitment() external view returns (bytes32);
    function activeEvidenceCommitment() external view returns (bytes32);
    function state() external view returns (uint8);
    function recordVerifiedEvidence(bytes32 claimId, bytes32 evidenceCommitment) external;
}
