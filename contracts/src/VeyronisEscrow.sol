// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract VeyronisEscrow {
    enum State {
        AwaitingPayment,
        AwaitingDelivery,
        RefundRequested,
        Disputed,
        Complete,
        Refunded,
        Cancelled
    }

    enum Resolution {
        ReleaseToSeller,
        RefundBuyer
    }

    error ZeroAddress();
    error RolesMustBeDistinct();
    error InvalidAgreementCommitment();
    error InvalidRequiredAmount();
    error InvalidEvidenceRegistry();
    error Unauthorized();
    error InvalidState(State expected, State actual);
    error DisputeUnavailable(State actual);
    error InvalidDeposit(uint256 expected, uint256 actual);
    error InvalidEvidenceCommitment();
    error NothingToWithdraw();
    error TransferFailed();
    error Reentrancy();
    error EvidenceAlreadyVerified();

    event Deposited(uint256 amount);
    event DeliveryConfirmed();
    event RefundRequested(bytes32 indexed evidenceCommitment);
    event RefundApproved();
    event DisputeOpened(bytes32 indexed evidenceCommitment);
    event DisputeResolved(Resolution resolution);
    event Cancelled();
    event WithdrawalCredited(address indexed recipient, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event VerifiedEvidenceRecorded(bytes32 indexed claimId, bytes32 indexed evidenceCommitment);

    address public immutable buyer;
    address public immutable seller;
    address public immutable arbitrator;
    bytes32 public immutable agreementCommitment;
    uint256 public immutable requiredAmount;
    address public immutable evidenceRegistry;

    State public state;
    uint256 public depositedAmount;
    bytes32 public activeEvidenceCommitment;
    bytes32 public verifiedClaimId;
    mapping(address => uint256) public withdrawals;

    uint256 private locked = 1;

    constructor(
        address buyer_,
        address seller_,
        address arbitrator_,
        bytes32 agreementCommitment_,
        uint256 requiredAmount_,
        address evidenceRegistry_
    ) {
        if (buyer_ == address(0) || seller_ == address(0) || arbitrator_ == address(0)) {
            revert ZeroAddress();
        }
        if (buyer_ == seller_ || buyer_ == arbitrator_ || seller_ == arbitrator_) {
            revert RolesMustBeDistinct();
        }
        if (agreementCommitment_ == bytes32(0)) revert InvalidAgreementCommitment();
        if (requiredAmount_ == 0) revert InvalidRequiredAmount();
        if (evidenceRegistry_ == address(0)) revert InvalidEvidenceRegistry();

        buyer = buyer_;
        seller = seller_;
        arbitrator = arbitrator_;
        agreementCommitment = agreementCommitment_;
        requiredAmount = requiredAmount_;
        evidenceRegistry = evidenceRegistry_;
    }

    modifier only(address account) {
        if (msg.sender != account) revert Unauthorized();
        _;
    }

    modifier inState(State expected) {
        if (state != expected) revert InvalidState(expected, state);
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    function deposit() external payable only(buyer) inState(State.AwaitingPayment) {
        if (msg.value != requiredAmount) revert InvalidDeposit(requiredAmount, msg.value);

        depositedAmount = msg.value;
        state = State.AwaitingDelivery;
        emit Deposited(msg.value);
    }

    function cancel() external only(buyer) inState(State.AwaitingPayment) {
        state = State.Cancelled;
        emit Cancelled();
    }

    function confirmDelivery() external only(buyer) inState(State.AwaitingDelivery) {
        state = State.Complete;
        emit DeliveryConfirmed();
        _credit(seller);
    }

    function requestRefund(bytes32 evidenceCommitment)
        external
        only(buyer)
        inState(State.AwaitingDelivery)
    {
        if (evidenceCommitment == bytes32(0)) revert InvalidEvidenceCommitment();

        state = State.RefundRequested;
        activeEvidenceCommitment = evidenceCommitment;
        emit RefundRequested(evidenceCommitment);
    }

    function approveRefund() external only(seller) inState(State.RefundRequested) {
        state = State.Refunded;
        emit RefundApproved();
        _credit(buyer);
    }

    function openDispute(bytes32 evidenceCommitment) external {
        if (msg.sender != buyer && msg.sender != seller) revert Unauthorized();
        if (state != State.AwaitingDelivery && state != State.RefundRequested) {
            revert DisputeUnavailable(state);
        }
        if (evidenceCommitment == bytes32(0)) revert InvalidEvidenceCommitment();

        state = State.Disputed;
        activeEvidenceCommitment = evidenceCommitment;
        emit DisputeOpened(evidenceCommitment);
    }

    function recordVerifiedEvidence(bytes32 claimId, bytes32 evidenceCommitment)
        external
        inState(State.Disputed)
    {
        if (msg.sender != evidenceRegistry) revert Unauthorized();
        if (claimId == bytes32(0) || evidenceCommitment == bytes32(0)) {
            revert InvalidEvidenceCommitment();
        }
        if (evidenceCommitment != activeEvidenceCommitment) {
            revert InvalidEvidenceCommitment();
        }
        if (verifiedClaimId != bytes32(0)) revert EvidenceAlreadyVerified();

        verifiedClaimId = claimId;
        emit VerifiedEvidenceRecorded(claimId, evidenceCommitment);
    }

    function resolveDispute(Resolution resolution)
        external
        only(arbitrator)
        inState(State.Disputed)
    {
        address recipient;
        if (resolution == Resolution.RefundBuyer) {
            state = State.Refunded;
            recipient = buyer;
        } else {
            state = State.Complete;
            recipient = seller;
        }

        emit DisputeResolved(resolution);
        _credit(recipient);
    }

    function withdraw() external nonReentrant {
        uint256 amount = withdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        withdrawals[msg.sender] = 0;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    function totalAccountedFunds() external view returns (uint256) {
        return depositedAmount + withdrawals[buyer] + withdrawals[seller];
    }

    function _credit(address recipient) private {
        uint256 amount = depositedAmount;
        depositedAmount = 0;
        withdrawals[recipient] += amount;
        emit WithdrawalCredited(recipient, amount);
    }
}
