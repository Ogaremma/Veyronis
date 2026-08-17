// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {VeyronisEscrow} from "../src/VeyronisEscrow.sol";

contract ReentrantSeller {
    VeyronisEscrow public escrow;
    bool public attempted;
    bool public reentrySucceeded;

    function setEscrow(VeyronisEscrow escrow_) external {
        escrow = escrow_;
    }

    function withdraw() external {
        escrow.withdraw();
    }

    receive() external payable {
        attempted = true;
        (reentrySucceeded,) = address(escrow).call(abi.encodeCall(VeyronisEscrow.withdraw, ()));
    }
}

contract RejectingBuyer {
    VeyronisEscrow public escrow;

    function setEscrow(VeyronisEscrow escrow_) external {
        escrow = escrow_;
    }

    function requestRefund(bytes32 evidence) external {
        escrow.requestRefund(evidence);
    }

    function withdraw() external {
        escrow.withdraw();
    }

    receive() external payable {
        revert("reject ETH");
    }
}

contract VeyronisEscrowTest is Test {
    address internal buyer = makeAddr("buyer");
    address internal seller = makeAddr("seller");
    address internal arbitrator = makeAddr("arbitrator");
    address internal stranger = makeAddr("stranger");
    address internal evidenceRegistry = makeAddr("evidenceRegistry");

    bytes32 internal constant AGREEMENT = keccak256("agreement");
    bytes32 internal constant POLICY = keccak256("evidence policy");
    bytes32 internal constant EVIDENCE = keccak256("evidence");
    uint256 internal constant PRICE = 10 ether;

    VeyronisEscrow internal escrow;

    event Deposited(uint256 amount);
    event DeliveryConfirmed();
    event RefundRequested(bytes32 indexed evidenceCommitment);
    event RefundApproved();
    event DisputeOpened(bytes32 indexed evidenceCommitment);
    event DisputeResolved(VeyronisEscrow.Resolution resolution);
    event Cancelled();
    event WithdrawalCredited(address indexed recipient, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);

    function setUp() public {
        escrow = _deploy(buyer, seller, arbitrator, AGREEMENT, PRICE);
        vm.deal(buyer, PRICE * 10);
    }

    function testConstructorStoresAgreement() public view {
        assertEq(escrow.buyer(), buyer);
        assertEq(escrow.seller(), seller);
        assertEq(escrow.arbitrator(), arbitrator);
        assertEq(escrow.agreementCommitment(), AGREEMENT);
        assertEq(escrow.evidencePolicyCommitment(), POLICY);
        assertEq(escrow.requiredAmount(), PRICE);
        assertEq(escrow.evidenceRegistry(), evidenceRegistry);
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.AwaitingPayment));
    }

    function testConstructorRejectsEachZeroAddress() public {
        vm.expectRevert(VeyronisEscrow.ZeroAddress.selector);
        new VeyronisEscrow(address(0), seller, arbitrator, AGREEMENT, POLICY, PRICE, evidenceRegistry);
        vm.expectRevert(VeyronisEscrow.ZeroAddress.selector);
        new VeyronisEscrow(buyer, address(0), arbitrator, AGREEMENT, POLICY, PRICE, evidenceRegistry);
        vm.expectRevert(VeyronisEscrow.ZeroAddress.selector);
        new VeyronisEscrow(buyer, seller, address(0), AGREEMENT, POLICY, PRICE, evidenceRegistry);
    }

    function testConstructorRejectsDuplicateRoles() public {
        vm.expectRevert(VeyronisEscrow.RolesMustBeDistinct.selector);
        new VeyronisEscrow(buyer, buyer, arbitrator, AGREEMENT, POLICY, PRICE, evidenceRegistry);
        vm.expectRevert(VeyronisEscrow.RolesMustBeDistinct.selector);
        new VeyronisEscrow(buyer, seller, buyer, AGREEMENT, POLICY, PRICE, evidenceRegistry);
        vm.expectRevert(VeyronisEscrow.RolesMustBeDistinct.selector);
        new VeyronisEscrow(buyer, seller, seller, AGREEMENT, POLICY, PRICE, evidenceRegistry);
    }

    function testConstructorRejectsZeroCommitmentAndAmount() public {
        vm.expectRevert(VeyronisEscrow.InvalidAgreementCommitment.selector);
        new VeyronisEscrow(buyer, seller, arbitrator, bytes32(0), POLICY, PRICE, evidenceRegistry);
        vm.expectRevert(VeyronisEscrow.InvalidEvidencePolicyCommitment.selector);
        new VeyronisEscrow(buyer, seller, arbitrator, AGREEMENT, bytes32(0), PRICE, evidenceRegistry);
        vm.expectRevert(VeyronisEscrow.InvalidRequiredAmount.selector);
        new VeyronisEscrow(buyer, seller, arbitrator, AGREEMENT, POLICY, 0, evidenceRegistry);
        vm.expectRevert(VeyronisEscrow.InvalidEvidenceRegistry.selector);
        new VeyronisEscrow(buyer, seller, arbitrator, AGREEMENT, POLICY, PRICE, address(0));
    }

    function testDepositExactAmountAndEvent() public {
        vm.expectEmit(false, false, false, true, address(escrow));
        emit Deposited(PRICE);
        _deposit();
        assertEq(escrow.depositedAmount(), PRICE);
        assertEq(address(escrow).balance, PRICE);
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.AwaitingDelivery));
    }

    function testFuzzDepositRejectsIncorrectAmount(uint256 amount) public {
        amount = bound(amount, 0, PRICE * 2);
        vm.assume(amount != PRICE);
        vm.deal(buyer, amount);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(VeyronisEscrow.InvalidDeposit.selector, PRICE, amount)
        );
        escrow.deposit{value: amount}();
    }

    function testOnlyBuyerCanDeposit() public {
        _expectUnauthorizedDeposit(seller);
        _expectUnauthorizedDeposit(arbitrator);
        _expectUnauthorizedDeposit(stranger);
    }

    function testDoubleDepositRejected() public {
        _deposit();
        vm.prank(buyer);
        vm.expectRevert(
            _invalidState(
                VeyronisEscrow.State.AwaitingPayment, VeyronisEscrow.State.AwaitingDelivery
            )
        );
        escrow.deposit{value: PRICE}();
    }

    function testBuyerCanCancelBeforePayment() public {
        vm.expectEmit(false, false, false, true, address(escrow));
        emit Cancelled();
        vm.prank(buyer);
        escrow.cancel();
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.Cancelled));
    }

    function testOnlyBuyerCanCancelAndCannotCancelAfterDeposit() public {
        for (uint256 i; i < 3; ++i) {
            address caller = i == 0 ? seller : i == 1 ? arbitrator : stranger;
            vm.prank(caller);
            vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
            escrow.cancel();
        }
        _deposit();
        vm.prank(buyer);
        vm.expectRevert(
            _invalidState(
                VeyronisEscrow.State.AwaitingPayment, VeyronisEscrow.State.AwaitingDelivery
            )
        );
        escrow.cancel();
    }

    function testConfirmDeliveryCreditsSellerAndWithdraws() public {
        _deposit();
        vm.expectEmit(false, false, false, true, address(escrow));
        emit DeliveryConfirmed();
        vm.expectEmit(true, false, false, true, address(escrow));
        emit WithdrawalCredited(seller, PRICE);
        vm.prank(buyer);
        escrow.confirmDelivery();
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.Complete));
        assertEq(escrow.depositedAmount(), 0);
        assertEq(escrow.withdrawals(seller), PRICE);
        _assertAccounting();

        uint256 beforeBalance = seller.balance;
        vm.expectEmit(true, false, false, true, address(escrow));
        emit Withdrawn(seller, PRICE);
        vm.prank(seller);
        escrow.withdraw();
        assertEq(seller.balance, beforeBalance + PRICE);
        assertEq(escrow.withdrawals(seller), 0);
        assertEq(address(escrow).balance, 0);
    }

    function testConfirmDeliveryAuthorizationAndStates() public {
        vm.prank(buyer);
        vm.expectRevert(
            _invalidState(
                VeyronisEscrow.State.AwaitingDelivery, VeyronisEscrow.State.AwaitingPayment
            )
        );
        escrow.confirmDelivery();
        _deposit();
        vm.prank(seller);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.confirmDelivery();
        vm.prank(arbitrator);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.confirmDelivery();
        vm.prank(buyer);
        escrow.confirmDelivery();
        vm.prank(buyer);
        vm.expectRevert(
            _invalidState(VeyronisEscrow.State.AwaitingDelivery, VeyronisEscrow.State.Complete)
        );
        escrow.confirmDelivery();
    }

    function testBuyerRequestsRefund() public {
        _deposit();
        vm.expectEmit(true, false, false, true, address(escrow));
        emit RefundRequested(EVIDENCE);
        vm.prank(buyer);
        escrow.requestRefund(EVIDENCE);
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.RefundRequested));
        assertEq(escrow.depositedAmount(), PRICE);
    }

    function testRefundRequestAuthorizationEvidenceAndState() public {
        vm.prank(buyer);
        vm.expectRevert(
            _invalidState(
                VeyronisEscrow.State.AwaitingDelivery, VeyronisEscrow.State.AwaitingPayment
            )
        );
        escrow.requestRefund(EVIDENCE);
        _deposit();
        vm.prank(seller);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.requestRefund(EVIDENCE);
        vm.prank(arbitrator);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.requestRefund(EVIDENCE);
        vm.prank(buyer);
        vm.expectRevert(VeyronisEscrow.InvalidEvidenceCommitment.selector);
        escrow.requestRefund(bytes32(0));
    }

    function testSellerApprovesRequestedRefund() public {
        _requestRefund();
        vm.expectEmit(false, false, false, true, address(escrow));
        emit RefundApproved();
        vm.expectEmit(true, false, false, true, address(escrow));
        emit WithdrawalCredited(buyer, PRICE);
        vm.prank(seller);
        escrow.approveRefund();
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.Refunded));
        assertEq(escrow.withdrawals(buyer), PRICE);
        _assertAccounting();
    }

    function testRefundApprovalAuthorizationAndState() public {
        _deposit();
        vm.prank(seller);
        vm.expectRevert(
            _invalidState(
                VeyronisEscrow.State.RefundRequested, VeyronisEscrow.State.AwaitingDelivery
            )
        );
        escrow.approveRefund();
        _requestRefundFromFunded();
        vm.prank(buyer);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.approveRefund();
        vm.prank(arbitrator);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.approveRefund();
    }

    function testEitherPartyCanOpenDisputeButNoOneElse() public {
        _deposit();
        vm.prank(stranger);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.openDispute(EVIDENCE);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit DisputeOpened(EVIDENCE);
        vm.prank(seller);
        escrow.openDispute(EVIDENCE);
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.Disputed));
    }

    function testRefundRequestCanEscalateToDispute() public {
        _requestRefund();
        vm.prank(seller);
        escrow.openDispute(EVIDENCE);
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.Disputed));
    }

    function testDisputeRequiresEvidenceAndValidState() public {
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                VeyronisEscrow.DisputeUnavailable.selector, VeyronisEscrow.State.AwaitingPayment
            )
        );
        escrow.openDispute(EVIDENCE);
        _deposit();
        vm.prank(buyer);
        vm.expectRevert(VeyronisEscrow.InvalidEvidenceCommitment.selector);
        escrow.openDispute(bytes32(0));
    }

    function testArbitratorResolvesForBuyer() public {
        _openDispute();
        vm.expectEmit(false, false, false, true, address(escrow));
        emit DisputeResolved(VeyronisEscrow.Resolution.RefundBuyer);
        vm.prank(arbitrator);
        escrow.resolveDispute(VeyronisEscrow.Resolution.RefundBuyer);
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.Refunded));
        assertEq(escrow.withdrawals(buyer), PRICE);
        assertEq(escrow.withdrawals(seller), 0);
    }

    function testArbitratorResolvesForSeller() public {
        _openDispute();
        vm.prank(arbitrator);
        escrow.resolveDispute(VeyronisEscrow.Resolution.ReleaseToSeller);
        assertEq(uint256(escrow.state()), uint256(VeyronisEscrow.State.Complete));
        assertEq(escrow.withdrawals(seller), PRICE);
        assertEq(escrow.withdrawals(buyer), 0);
    }

    function testOnlyArbitratorResolvesAndCannotResolveTwice() public {
        _openDispute();
        vm.prank(buyer);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.resolveDispute(VeyronisEscrow.Resolution.RefundBuyer);
        vm.prank(seller);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.resolveDispute(VeyronisEscrow.Resolution.ReleaseToSeller);
        vm.prank(arbitrator);
        escrow.resolveDispute(VeyronisEscrow.Resolution.ReleaseToSeller);
        vm.prank(arbitrator);
        vm.expectRevert(_invalidState(VeyronisEscrow.State.Disputed, VeyronisEscrow.State.Complete));
        escrow.resolveDispute(VeyronisEscrow.Resolution.RefundBuyer);
    }

    function testCannotResolveWithoutDispute() public {
        vm.prank(arbitrator);
        vm.expectRevert(
            _invalidState(VeyronisEscrow.State.Disputed, VeyronisEscrow.State.AwaitingPayment)
        );
        escrow.resolveDispute(VeyronisEscrow.Resolution.RefundBuyer);
    }

    function testZeroAndRepeatedWithdrawalFail() public {
        vm.prank(seller);
        vm.expectRevert(VeyronisEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
        _complete();
        vm.prank(seller);
        escrow.withdraw();
        vm.prank(seller);
        vm.expectRevert(VeyronisEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }

    function testCannotWithdrawAnotherUsersCredit() public {
        _complete();
        vm.prank(stranger);
        vm.expectRevert(VeyronisEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
        assertEq(escrow.withdrawals(seller), PRICE);
    }

    function testRejectingRecipientRestoresWithdrawalCredit() public {
        RejectingBuyer rejectingBuyer = new RejectingBuyer();
        VeyronisEscrow localEscrow =
            _deploy(address(rejectingBuyer), seller, arbitrator, AGREEMENT, PRICE);
        rejectingBuyer.setEscrow(localEscrow);
        vm.deal(address(rejectingBuyer), PRICE);
        vm.prank(address(rejectingBuyer));
        localEscrow.deposit{value: PRICE}();
        rejectingBuyer.requestRefund(EVIDENCE);
        vm.prank(seller);
        localEscrow.approveRefund();

        vm.expectRevert(VeyronisEscrow.TransferFailed.selector);
        rejectingBuyer.withdraw();
        assertEq(localEscrow.withdrawals(address(rejectingBuyer)), PRICE);
        assertEq(address(localEscrow).balance, PRICE);
    }

    function testReentrantWithdrawalCannotDrainTwice() public {
        ReentrantSeller attacker = new ReentrantSeller();
        VeyronisEscrow localEscrow = _deploy(buyer, address(attacker), arbitrator, AGREEMENT, PRICE);
        attacker.setEscrow(localEscrow);
        vm.prank(buyer);
        localEscrow.deposit{value: PRICE}();
        vm.prank(buyer);
        localEscrow.confirmDelivery();

        attacker.withdraw();
        assertTrue(attacker.attempted());
        assertFalse(attacker.reentrySucceeded());
        assertEq(address(attacker).balance, PRICE);
        assertEq(localEscrow.withdrawals(address(attacker)), 0);
        assertEq(address(localEscrow).balance, 0);
    }

    function testCancelledEscrowCannotProgress() public {
        vm.prank(buyer);
        escrow.cancel();
        vm.prank(buyer);
        vm.expectRevert(
            _invalidState(VeyronisEscrow.State.AwaitingPayment, VeyronisEscrow.State.Cancelled)
        );
        escrow.deposit{value: PRICE}();
        vm.prank(buyer);
        vm.expectRevert(
            _invalidState(VeyronisEscrow.State.AwaitingDelivery, VeyronisEscrow.State.Cancelled)
        );
        escrow.confirmDelivery();
    }

    function testCompletedEscrowCannotRefundOrDispute() public {
        _complete();
        vm.prank(buyer);
        vm.expectRevert(
            _invalidState(VeyronisEscrow.State.AwaitingDelivery, VeyronisEscrow.State.Complete)
        );
        escrow.requestRefund(EVIDENCE);
        vm.prank(seller);
        vm.expectRevert(
            abi.encodeWithSelector(
                VeyronisEscrow.DisputeUnavailable.selector, VeyronisEscrow.State.Complete
            )
        );
        escrow.openDispute(EVIDENCE);
    }

    function testRefundedEscrowCannotSettleOrRefundAgain() public {
        _requestRefund();
        vm.prank(seller);
        escrow.approveRefund();
        vm.prank(buyer);
        vm.expectRevert(
            _invalidState(VeyronisEscrow.State.AwaitingDelivery, VeyronisEscrow.State.Refunded)
        );
        escrow.confirmDelivery();
        vm.prank(seller);
        vm.expectRevert(
            _invalidState(VeyronisEscrow.State.RefundRequested, VeyronisEscrow.State.Refunded)
        );
        escrow.approveRefund();
    }

    function testDisputedEscrowCannotBypassArbitrator() public {
        _openDispute();
        vm.prank(buyer);
        vm.expectRevert(
            _invalidState(VeyronisEscrow.State.AwaitingDelivery, VeyronisEscrow.State.Disputed)
        );
        escrow.confirmDelivery();
        vm.prank(seller);
        vm.expectRevert(
            _invalidState(VeyronisEscrow.State.RefundRequested, VeyronisEscrow.State.Disputed)
        );
        escrow.approveRefund();
    }

    function testFuzzUnauthorizedCallersRemainSeparated(address caller) public {
        vm.assume(caller != buyer && caller != seller && caller != arbitrator);
        vm.prank(caller);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.deposit{value: 0}();
        vm.prank(caller);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.cancel();
    }

    function testFuzzAccountingNeverExceedsBalance(uint96 rawPrice, bool refundBuyer) public {
        uint256 price = bound(uint256(rawPrice), 1, 100 ether);
        VeyronisEscrow localEscrow = _deploy(buyer, seller, arbitrator, AGREEMENT, price);
        vm.deal(buyer, price);
        vm.prank(buyer);
        localEscrow.deposit{value: price}();
        vm.prank(buyer);
        localEscrow.openDispute(EVIDENCE);
        vm.prank(arbitrator);
        localEscrow.resolveDispute(
            refundBuyer
                ? VeyronisEscrow.Resolution.RefundBuyer
                : VeyronisEscrow.Resolution.ReleaseToSeller
        );
        assertEq(localEscrow.totalAccountedFunds(), address(localEscrow).balance);
        assertEq(localEscrow.totalAccountedFunds(), price);
    }

    function _deploy(
        address buyer_,
        address seller_,
        address arbitrator_,
        bytes32 agreement_,
        uint256 price_
    ) internal returns (VeyronisEscrow) {
        return new VeyronisEscrow(
            buyer_, seller_, arbitrator_, agreement_, POLICY, price_, evidenceRegistry
        );
    }

    function _deposit() internal {
        vm.prank(buyer);
        escrow.deposit{value: PRICE}();
    }

    function _requestRefund() internal {
        _deposit();
        _requestRefundFromFunded();
    }

    function _requestRefundFromFunded() internal {
        vm.prank(buyer);
        escrow.requestRefund(EVIDENCE);
    }

    function _openDispute() internal {
        _deposit();
        vm.prank(buyer);
        escrow.openDispute(EVIDENCE);
    }

    function _complete() internal {
        _deposit();
        vm.prank(buyer);
        escrow.confirmDelivery();
    }

    function _expectUnauthorizedDeposit(address caller) internal {
        vm.deal(caller, PRICE);
        vm.prank(caller);
        vm.expectRevert(VeyronisEscrow.Unauthorized.selector);
        escrow.deposit{value: PRICE}();
    }

    function _invalidState(VeyronisEscrow.State expected, VeyronisEscrow.State actual)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(VeyronisEscrow.InvalidState.selector, expected, actual);
    }

    function _assertAccounting() internal view {
        assertEq(escrow.totalAccountedFunds(), address(escrow).balance);
        assertLe(escrow.totalAccountedFunds(), PRICE);
    }
}
