// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {EvidenceClaimRegistry} from "../src/EvidenceClaimRegistry.sol";
import {VeyronisEscrow} from "../src/VeyronisEscrow.sol";

contract EvidenceClaimRegistryTest is Test {
    address internal buyer = makeAddr("buyer");
    address internal seller = makeAddr("seller");
    address internal arbitrator = makeAddr("arbitrator");
    address internal verifier = makeAddr("verifier");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant AGREEMENT = keccak256("agreement");
    bytes32 internal constant OTHER_AGREEMENT = keccak256("other agreement");
    bytes32 internal constant POLICY = keccak256("evidence policy");
    bytes32 internal constant EVIDENCE_TYPE = keccak256("SOURCE_PAYMENT");
    bytes32 internal constant SOURCE_TX = keccak256("source transaction");
    uint64 internal constant SOURCE_CHAIN_KEY = 1;
    uint256 internal constant PRICE = 10 ether;

    EvidenceClaimRegistry internal registry;
    VeyronisEscrow internal escrow;

    event VerifiedClaimAccepted(
        bytes32 indexed claimId,
        address indexed escrow,
        bytes32 indexed evidenceCommitment,
        bytes32 sourceEvidenceKey
    );

    function setUp() public {
        registry = new EvidenceClaimRegistry(verifier);
        escrow = _deployEscrow(AGREEMENT);
        vm.deal(buyer, PRICE * 10);
        _fundAndDispute(escrow, _evidenceCommitment(SOURCE_TX, buyer));
    }

    function testValidClaimAcceptedWithoutSettlement() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        bytes32 claimId = registry.computeClaimId(claim);
        bytes32 sourceKey = registry.computeSourceEvidenceKey(claim);

        vm.expectEmit(true, true, true, true, address(registry));
        emit VerifiedClaimAccepted(claimId, address(escrow), claim.evidenceCommitment, sourceKey);
        vm.prank(verifier);
        bytes32 acceptedId = registry.submitVerifiedClaim(claim);

        assertEq(acceptedId, claimId);
        assertTrue(registry.consumedClaims(claimId));
        assertEq(registry.sourceEvidenceEscrow(sourceKey), address(escrow));
        assertEq(escrow.verifiedClaimId(), claimId);
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.Disputed));
        assertEq(escrow.depositedAmount(), PRICE);
        assertEq(escrow.withdrawals(buyer), 0);
        assertEq(escrow.withdrawals(seller), 0);
    }

    function testUnauthorizedSubmitterRejected() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        vm.prank(stranger);
        vm.expectRevert(EvidenceClaimRegistry.UnauthorizedVerifier.selector);
        registry.submitVerifiedClaim(claim);
    }

    function testWrongEscrowRejected() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        claim.escrow = stranger;
        vm.prank(verifier);
        vm.expectRevert(EvidenceClaimRegistry.InvalidEscrow.selector);
        registry.submitVerifiedClaim(claim);
    }

    function testWrongAgreementRejected() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, OTHER_AGREEMENT, SOURCE_TX, buyer);
        vm.prank(verifier);
        vm.expectRevert(EvidenceClaimRegistry.WrongAgreement.selector);
        registry.submitVerifiedClaim(claim);
    }

    function testWrongEvidencePolicyRejected() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        claim.evidencePolicyCommitment = keccak256("modified policy");
        vm.prank(verifier);
        vm.expectRevert(EvidenceClaimRegistry.WrongEvidencePolicy.selector);
        registry.submitVerifiedClaim(claim);
    }

    function testWrongEvidenceCommitmentRejected() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        claim.evidenceCommitment = keccak256("wrong evidence");
        vm.prank(verifier);
        vm.expectRevert(EvidenceClaimRegistry.WrongEvidenceCommitment.selector);
        registry.submitVerifiedClaim(claim);
    }

    function testAlteredSourceContextRejected() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        claim.sourceTransactionHash = keccak256("altered transaction");
        vm.prank(verifier);
        vm.expectRevert(EvidenceClaimRegistry.WrongEvidenceCommitment.selector);
        registry.submitVerifiedClaim(claim);
    }

    function testWrongSubjectRejected() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, stranger);
        claim.evidenceCommitment = escrow.activeEvidenceCommitment();
        vm.prank(verifier);
        vm.expectRevert(EvidenceClaimRegistry.WrongSubject.selector);
        registry.submitVerifiedClaim(claim);
    }

    function testDuplicateClaimRejected() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        bytes32 claimId = registry.computeClaimId(claim);
        vm.prank(verifier);
        registry.submitVerifiedClaim(claim);
        vm.prank(verifier);
        vm.expectRevert(
            abi.encodeWithSelector(EvidenceClaimRegistry.ClaimAlreadyConsumed.selector, claimId)
        );
        registry.submitVerifiedClaim(claim);
    }

    function testSameSourceEvidenceCannotBindAnotherEscrow() public {
        EvidenceClaimRegistry.Claim memory first = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        vm.prank(verifier);
        registry.submitVerifiedClaim(first);

        VeyronisEscrow otherEscrow = _deployEscrow(OTHER_AGREEMENT);
        _fundAndDispute(otherEscrow, _evidenceCommitment(SOURCE_TX, buyer));
        EvidenceClaimRegistry.Claim memory replay =
            _claim(otherEscrow, OTHER_AGREEMENT, SOURCE_TX, buyer);
        bytes32 sourceKey = registry.computeSourceEvidenceKey(replay);

        vm.prank(verifier);
        vm.expectRevert(
            abi.encodeWithSelector(
                EvidenceClaimRegistry.SourceEvidenceAlreadyBound.selector,
                sourceKey,
                address(escrow)
            )
        );
        registry.submitVerifiedClaim(replay);
    }

    function testTerminalEscrowRejectsEvidence() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        vm.prank(arbitrator);
        escrow.resolveDispute(VeyronisEscrow.Resolution.ReleaseToSeller);
        vm.prank(verifier);
        vm.expectRevert(
            abi.encodeWithSelector(
                EvidenceClaimRegistry.EscrowNotDisputed.selector,
                uint8(VeyronisEscrow.State.Complete)
            )
        );
        registry.submitVerifiedClaim(claim);
    }

    function testMalformedClaimsRejected() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        claim.sourceTransactionHash = bytes32(0);
        vm.prank(verifier);
        vm.expectRevert(EvidenceClaimRegistry.MalformedClaim.selector);
        registry.submitVerifiedClaim(claim);
    }

    function testClaimCannotBypassStateMachineOrChangeAccounting() public {
        uint256 balanceBefore = address(escrow).balance;
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        vm.prank(verifier);
        registry.submitVerifiedClaim(claim);

        assertEq(address(escrow).balance, balanceBefore);
        assertEq(escrow.totalAccountedFunds(), balanceBefore);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                VeyronisEscrow.InvalidState.selector,
                VeyronisEscrow.State.AwaitingDelivery,
                VeyronisEscrow.State.Disputed
            )
        );
        escrow.confirmDelivery();
    }

    function testClaimCannotCauseDoubleSettlement() public {
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        vm.prank(verifier);
        registry.submitVerifiedClaim(claim);
        vm.prank(arbitrator);
        escrow.resolveDispute(VeyronisEscrow.Resolution.RefundBuyer);

        assertEq(escrow.withdrawals(buyer), PRICE);
        assertEq(escrow.withdrawals(seller), 0);
        vm.prank(verifier);
        vm.expectRevert(
            abi.encodeWithSelector(
                EvidenceClaimRegistry.EscrowNotDisputed.selector,
                uint8(VeyronisEscrow.State.Refunded)
            )
        );
        registry.submitVerifiedClaim(claim);
        assertEq(escrow.totalAccountedFunds(), address(escrow).balance);
    }

    function testFuzzAlteredClaimCommitmentRejected(
        bytes32 alteredType,
        uint64 alteredChain,
        bytes32 alteredTransaction
    ) public {
        vm.assume(
            alteredType != EVIDENCE_TYPE || alteredChain != SOURCE_CHAIN_KEY
                || alteredTransaction != SOURCE_TX
        );
        vm.assume(
            alteredType != bytes32(0) && alteredChain != 0 && alteredTransaction != bytes32(0)
        );
        EvidenceClaimRegistry.Claim memory claim = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        claim.evidenceType = alteredType;
        claim.sourceChainKey = alteredChain;
        claim.sourceTransactionHash = alteredTransaction;

        vm.prank(verifier);
        vm.expectRevert(EvidenceClaimRegistry.WrongEvidenceCommitment.selector);
        registry.submitVerifiedClaim(claim);
    }

    function testFuzzClaimIdChangesWithEscrowContext(bytes32 otherAgreement) public {
        vm.assume(otherAgreement != bytes32(0) && otherAgreement != AGREEMENT);
        VeyronisEscrow otherEscrow = _deployEscrow(otherAgreement);
        EvidenceClaimRegistry.Claim memory original = _claim(escrow, AGREEMENT, SOURCE_TX, buyer);
        EvidenceClaimRegistry.Claim memory altered =
            _claim(otherEscrow, otherAgreement, SOURCE_TX, buyer);
        assertNotEq(registry.computeClaimId(original), registry.computeClaimId(altered));
    }

    function _deployEscrow(bytes32 agreement) internal returns (VeyronisEscrow) {
        return new VeyronisEscrow(
            buyer, seller, arbitrator, agreement, POLICY, PRICE, address(registry)
        );
    }

    function _fundAndDispute(VeyronisEscrow target, bytes32 evidenceCommitment) internal {
        vm.prank(buyer);
        target.deposit{value: PRICE}();
        vm.prank(buyer);
        target.openDispute(evidenceCommitment);
    }

    function _claim(
        VeyronisEscrow target,
        bytes32 agreement,
        bytes32 sourceTransactionHash,
        address subject
    ) internal view returns (EvidenceClaimRegistry.Claim memory) {
        return EvidenceClaimRegistry.Claim({
            escrow: address(target),
            agreementCommitment: agreement,
            evidencePolicyCommitment: POLICY,
            evidenceCommitment: _evidenceCommitment(sourceTransactionHash, subject),
            evidenceType: EVIDENCE_TYPE,
            sourceChainKey: SOURCE_CHAIN_KEY,
            sourceTransactionHash: sourceTransactionHash,
            subject: subject
        });
    }

    function _evidenceCommitment(bytes32 sourceTransactionHash, address subject)
        internal
        view
        returns (bytes32)
    {
        return registry.computeEvidenceCommitment(
            POLICY, EVIDENCE_TYPE, SOURCE_CHAIN_KEY, sourceTransactionHash, subject
        );
    }
}
