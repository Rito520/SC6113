// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IDisputeManager} from "./interfaces/IDisputeManager.sol";

/// @title ProjectEscrow
/// @notice Freelancer Milestone Payment DApp – projects, milestones and the ETH escrow.
///         A Client creates a project for one Freelancer, defines milestones whose amounts add up to the
///         project total, the Freelancer accepts, the Client deposits the full amount, and each approved
///         milestone pays the Freelancer immediately. Disputes go to DisputeManager.
/// @dev Requirement references (BR = business rule, FR = functional, SR = security) follow
///      Freelancer_Milestone_Payment_Requirements_v1.md.
///      Security: ReentrancyGuard + checks-effects-interactions on every ETH transfer, per-project escrow
///      accounting (SR-06), explicit state machines (SR-05), role checks via RoleManager (SR-01).
///      Gas: packed structs (Project = 3 slots, Milestone = 1 slot), custom errors, immutables,
///      document hashes kept in events rather than storage.
contract ProjectEscrow is ReentrancyGuard, Pausable {
    // ------------------------------------------------------------------ roles
    bytes32 private constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 private constant CLIENT_ROLE = keccak256("CLIENT_ROLE");
    bytes32 private constant FREELANCER_ROLE = keccak256("FREELANCER_ROLE");

    // ------------------------------------------------------------------ constants
    uint8 public constant MAX_MILESTONES = 20;
    /// @notice if the Client neither approves nor rejects a submission for this long, the Freelancer can claim it
    uint40 public constant REVIEW_PERIOD = 7 days;

    // ------------------------------------------------------------------ types (Requirements §7 and §8)
    enum ProjectStatus { None, Created, Accepted, Funded, Active, Disputed, Completed, Cancelled }
    enum MilestoneStatus { Pending, InProgress, Submitted, Rejected, Approved, Disputed, Resolved }

    /// @dev slot 1: client(20) deadline(5) status(1) milestoneCount(1) settledCount(1) openDisputes(1) = 29 bytes
    ///      slot 2: freelancer(20) totalAmount(12)
    ///      slot 3: allocatedAmount(12) escrowBalance(12)
    struct Project {
        address client;
        uint40 deadline;
        ProjectStatus status;
        uint8 milestoneCount;
        uint8 settledCount;
        uint8 openDisputes;
        address freelancer;
        uint96 totalAmount;
        uint96 allocatedAmount;
        uint96 escrowBalance;
    }

    /// @dev one slot: amount(12) dueDate(5) submittedAt(5) status(1)
    struct Milestone {
        uint96 amount;
        uint40 dueDate;
        uint40 submittedAt;
        MilestoneStatus status;
    }

    // ------------------------------------------------------------------ storage
    IAccessControl public immutable roles;
    IDisputeManager public disputeManager; // set once after DisputeManager is deployed
    uint64 public projectCount;

    mapping(uint256 => Project) private _projects;
    mapping(uint256 => mapping(uint256 => Milestone)) private _milestones;
    /// @notice fallback ledger: ETH that could not be pushed to a recipient (e.g. a contract wallet that rejects ETH)
    mapping(address => uint256) public pendingWithdrawals;

    // ------------------------------------------------------------------ errors
    error NotAuthorized();
    error MissingRole(bytes32 role);
    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidProjectStatus(ProjectStatus current);
    error InvalidMilestoneStatus(MilestoneStatus current);
    error InvalidMilestoneIndex();
    error TooManyMilestones();
    error MilestoneTotalMismatch(uint256 allocated, uint256 total);
    error IncorrectDeposit(uint256 sent, uint256 required);
    error InsufficientEscrow(uint256 balance, uint256 required);
    error ReviewPeriodActive(uint256 claimableAt);
    error NotOverdue(uint256 dueDate);
    error DisputeManagerAlreadySet();
    error NothingToWithdraw();
    error TransferFailed();

    // ------------------------------------------------------------------ events (FR-16)
    event ProjectCreated(uint256 indexed projectId, address indexed client, address indexed freelancer, uint256 totalAmount, uint40 deadline, bytes32 metadataHash);
    event MilestoneAdded(uint256 indexed projectId, uint256 indexed index, uint256 amount, uint40 dueDate, bytes32 metadataHash);
    event ProjectAccepted(uint256 indexed projectId, address indexed freelancer);
    event ProjectFunded(uint256 indexed projectId, address indexed client, uint256 amount);
    event ProjectActivated(uint256 indexed projectId);
    event ProjectCancelled(uint256 indexed projectId, uint256 refunded);
    event ProjectCompleted(uint256 indexed projectId);
    event MilestoneStarted(uint256 indexed projectId, uint256 indexed index);
    event MilestoneSubmitted(uint256 indexed projectId, uint256 indexed index, bytes32 deliverableHash, bool resubmission);
    event MilestoneRejected(uint256 indexed projectId, uint256 indexed index, bytes32 reasonHash);
    event MilestoneApproved(uint256 indexed projectId, uint256 indexed index, bool autoApproved);
    event PaymentReleased(uint256 indexed projectId, uint256 indexed index, address indexed to, uint256 amount);
    event FundsRefunded(uint256 indexed projectId, uint256 indexed index, address indexed to, uint256 amount);
    event DisputeRaised(uint256 indexed projectId, uint256 indexed index, uint256 indexed disputeId, address raisedBy);
    event DisputeSettled(uint256 indexed projectId, uint256 indexed index, bool releasedToFreelancer);
    event PaymentDeferred(address indexed to, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event DisputeManagerSet(address disputeManager);

    // ------------------------------------------------------------------ modifiers
    modifier onlyRole(bytes32 role) {
        if (!roles.hasRole(role, msg.sender)) revert MissingRole(role);
        _;
    }

    constructor(IAccessControl roleManager) {
        if (address(roleManager) == address(0)) revert InvalidAddress();
        roles = roleManager;
    }

    // ================================================================== project setup (Client)

    /// @notice TX: Client creates a project and assigns a Freelancer by wallet address (FR-03, §5.1).
    ///         Milestones are added with addMilestone, or use createProjectWithMilestones for one transaction.
    function createProject(address freelancer, uint96 totalAmount, uint40 deadline, bytes32 metadataHash)
        external
        whenNotPaused
        onlyRole(CLIENT_ROLE)
        returns (uint256 projectId)
    {
        projectId = _createProject(freelancer, totalAmount, deadline, metadataHash);
    }

    /// @notice TX: create a project and all its milestones at once; the total is the sum of the milestones (BR-03).
    function createProjectWithMilestones(
        address freelancer,
        uint40 deadline,
        bytes32 metadataHash,
        uint96[] calldata amounts,
        uint40[] calldata dueDates,
        bytes32[] calldata milestoneHashes
    ) external whenNotPaused onlyRole(CLIENT_ROLE) returns (uint256 projectId) {
        uint256 n = amounts.length;
        if (n == 0 || n != dueDates.length || n != milestoneHashes.length) revert InvalidAmount();
        if (n > MAX_MILESTONES) revert TooManyMilestones();
        uint256 total;
        for (uint256 i; i < n; ++i) total += amounts[i];
        if (total > type(uint96).max) revert InvalidAmount();

        projectId = _createProject(freelancer, uint96(total), deadline, metadataHash);
        Project storage p = _projects[projectId];
        for (uint256 i; i < n; ++i) {
            _addMilestone(projectId, p, amounts[i], dueDates[i], milestoneHashes[i]);
        }
    }

    /// @notice TX: Client adds one milestone. Only allowed before the Freelancer accepts or the project is funded,
    ///         so the agreed terms cannot change afterwards (BR-02, BR-14).
    function addMilestone(uint256 projectId, uint96 amount, uint40 dueDate, bytes32 metadataHash) external whenNotPaused {
        Project storage p = _projects[projectId];
        if (p.client != msg.sender) revert NotAuthorized();
        if (p.status != ProjectStatus.Created) revert InvalidProjectStatus(p.status);
        if (p.milestoneCount >= MAX_MILESTONES) revert TooManyMilestones();
        _addMilestone(projectId, p, amount, dueDate, metadataHash);
    }

    /// @notice TX: the assigned Freelancer accepts the project terms (BR-04, FR-05).
    function acceptProject(uint256 projectId) external whenNotPaused {
        Project storage p = _projects[projectId];
        if (p.freelancer != msg.sender) revert NotAuthorized();
        ProjectStatus s = p.status;
        if (s != ProjectStatus.Created && s != ProjectStatus.Funded) revert InvalidProjectStatus(s);
        _requireMilestonesComplete(p);
        emit ProjectAccepted(projectId, msg.sender);
        if (s == ProjectStatus.Funded) {
            _activate(projectId, p);
        } else {
            p.status = ProjectStatus.Accepted;
        }
    }

    /// @notice TX: Client deposits the full project amount in ETH (BR-01, FR-06, §5.2).
    ///         Normally after acceptance; if done first, the project waits in FUNDED until the Freelancer accepts.
    function fundProject(uint256 projectId) external payable whenNotPaused {
        Project storage p = _projects[projectId];
        if (p.client != msg.sender) revert NotAuthorized();
        ProjectStatus s = p.status;
        if (s != ProjectStatus.Created && s != ProjectStatus.Accepted) revert InvalidProjectStatus(s);
        _requireMilestonesComplete(p);
        if (msg.value != p.totalAmount) revert IncorrectDeposit(msg.value, p.totalAmount);
        p.escrowBalance = uint96(msg.value);
        emit ProjectFunded(projectId, msg.sender, msg.value);
        if (s == ProjectStatus.Accepted) {
            _activate(projectId, p); // BR-05: accepted AND funded
        } else {
            p.status = ProjectStatus.Funded;
        }
    }

    /// @notice TX: Client cancels before work begins; any deposit is refunded. Not possible once ACTIVE (BR-13).
    function cancelProject(uint256 projectId) external nonReentrant {
        Project storage p = _projects[projectId];
        if (p.client != msg.sender) revert NotAuthorized();
        ProjectStatus s = p.status;
        if (s != ProjectStatus.Created && s != ProjectStatus.Accepted && s != ProjectStatus.Funded) {
            revert InvalidProjectStatus(s);
        }
        uint256 refund = p.escrowBalance;
        p.escrowBalance = 0;
        p.status = ProjectStatus.Cancelled;
        emit ProjectCancelled(projectId, refund);
        if (refund != 0) _send(msg.sender, refund);
    }

    // ================================================================== milestone work (Freelancer)

    /// @notice TX: Freelancer marks a milestone as being worked on (PENDING → IN_PROGRESS).
    function startMilestone(uint256 projectId, uint256 index) external {
        (Project storage p, Milestone storage m) = _load(projectId, index);
        if (p.freelancer != msg.sender) revert NotAuthorized();
        _requireWorkable(p);
        if (m.status != MilestoneStatus.Pending) revert InvalidMilestoneStatus(m.status);
        m.status = MilestoneStatus.InProgress;
        emit MilestoneStarted(projectId, index);
    }

    /// @notice TX: Freelancer submits a milestone for review (BR-06, BR-07, FR-08).
    /// @param deliverableHash hash / reference of the off-chain deliverable (§14)
    function submitMilestone(uint256 projectId, uint256 index, bytes32 deliverableHash) external {
        (Project storage p, Milestone storage m) = _load(projectId, index);
        if (p.freelancer != msg.sender) revert NotAuthorized();
        _requireWorkable(p);
        MilestoneStatus s = m.status;
        if (s != MilestoneStatus.Pending && s != MilestoneStatus.InProgress) revert InvalidMilestoneStatus(s);
        _markSubmitted(m);
        emit MilestoneSubmitted(projectId, index, deliverableHash, false);
    }

    /// @notice TX: Freelancer resubmits a rejected milestone after revising it (FR-12, §5.3).
    function resubmitMilestone(uint256 projectId, uint256 index, bytes32 deliverableHash) external {
        (Project storage p, Milestone storage m) = _load(projectId, index);
        if (p.freelancer != msg.sender) revert NotAuthorized();
        _requireWorkable(p);
        if (m.status != MilestoneStatus.Rejected) revert InvalidMilestoneStatus(m.status);
        _markSubmitted(m);
        emit MilestoneSubmitted(projectId, index, deliverableHash, true);
    }

    /// @notice TX: if the Client ignores a submission for REVIEW_PERIOD, the Freelancer claims the payment.
    function claimAfterReview(uint256 projectId, uint256 index) external nonReentrant {
        (Project storage p, Milestone storage m) = _load(projectId, index);
        if (p.freelancer != msg.sender) revert NotAuthorized();
        _requireWorkable(p);
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus(m.status);
        uint256 claimableAt = uint256(m.submittedAt) + REVIEW_PERIOD;
        if (block.timestamp < claimableAt) revert ReviewPeriodActive(claimableAt);
        m.status = MilestoneStatus.Approved;
        emit MilestoneApproved(projectId, index, true);
        _release(projectId, p, index, m.amount, p.freelancer);
    }

    // ================================================================== review (Client)

    /// @notice TX: Client approves a submission; the milestone amount is paid to the Freelancer at once
    ///         (BR-08, BR-09, BR-10, FR-09, FR-10).
    function approveMilestone(uint256 projectId, uint256 index) external nonReentrant {
        (Project storage p, Milestone storage m) = _load(projectId, index);
        if (p.client != msg.sender) revert NotAuthorized();
        _requireWorkable(p);
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus(m.status);
        m.status = MilestoneStatus.Approved;
        emit MilestoneApproved(projectId, index, false);
        _release(projectId, p, index, m.amount, p.freelancer);
    }

    /// @notice TX: Client rejects a submission. No refund happens (§5.3): the Freelancer resubmits or disputes.
    /// @param reasonHash hash of the rejection reason stored off-chain (FR-11, §13)
    function rejectMilestone(uint256 projectId, uint256 index, bytes32 reasonHash) external {
        (Project storage p, Milestone storage m) = _load(projectId, index);
        if (p.client != msg.sender) revert NotAuthorized();
        _requireWorkable(p);
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus(m.status);
        m.status = MilestoneStatus.Rejected;
        emit MilestoneRejected(projectId, index, reasonHash);
    }

    // ================================================================== disputes

    /// @notice TX: Client or Freelancer opens a dispute on a milestone (FR-13). Allowed when the milestone is
    ///         SUBMITTED or REJECTED, or when it is past its due date without a submission.
    ///         The milestone's funds are frozen until an Arbitrator decides (BR-11).
    function raiseDispute(uint256 projectId, uint256 index, bytes32 reasonHash) external returns (uint256 disputeId) {
        (Project storage p, Milestone storage m) = _load(projectId, index);
        if (msg.sender != p.client && msg.sender != p.freelancer) revert NotAuthorized();
        _requireWorkable(p);
        MilestoneStatus s = m.status;
        if (s == MilestoneStatus.Pending || s == MilestoneStatus.InProgress) {
            if (block.timestamp <= m.dueDate) revert NotOverdue(m.dueDate);
        } else if (s != MilestoneStatus.Submitted && s != MilestoneStatus.Rejected) {
            revert InvalidMilestoneStatus(s);
        }
        m.status = MilestoneStatus.Disputed;
        unchecked { ++p.openDisputes; } // bounded by MAX_MILESTONES
        p.status = ProjectStatus.Disputed;
        disputeId = disputeManager.openDispute(projectId, index, msg.sender, reasonHash);
        emit DisputeRaised(projectId, index, disputeId, msg.sender);
    }

    /// @notice Called only by DisputeManager to carry out an Arbitrator's binary decision (§5.4, FR-14).
    function executeResolution(uint256 projectId, uint256 index, bool releaseToFreelancer) external nonReentrant {
        if (msg.sender != address(disputeManager)) revert NotAuthorized();
        (Project storage p, Milestone storage m) = _load(projectId, index);
        if (m.status != MilestoneStatus.Disputed) revert InvalidMilestoneStatus(m.status);
        m.status = MilestoneStatus.Resolved;
        unchecked { --p.openDisputes; }
        if (p.openDisputes == 0) p.status = ProjectStatus.Active;
        emit DisputeSettled(projectId, index, releaseToFreelancer);
        _release(projectId, p, index, m.amount, releaseToFreelancer ? p.freelancer : p.client);
    }

    // ================================================================== fallback withdrawal

    /// @notice TX: collect ETH that could not be pushed automatically (only used if a direct transfer failed).
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ================================================================== admin

    /// @notice TX: Admin connects the DisputeManager once (it is deployed after this contract).
    function setDisputeManager(IDisputeManager manager) external onlyRole(ADMIN_ROLE) {
        if (address(disputeManager) != address(0)) revert DisputeManagerAlreadySet();
        if (address(manager) == address(0)) revert InvalidAddress();
        disputeManager = manager;
        emit DisputeManagerSet(address(manager));
    }

    /// @notice TX: emergency stop for new projects, milestones, acceptance and funding.
    ///         Work, approvals, disputes, cancellations and withdrawals keep working so funds are never trapped.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ================================================================== views

    function getProject(uint256 projectId) external view returns (Project memory) {
        return _projects[projectId];
    }

    function getMilestone(uint256 projectId, uint256 index) external view returns (Milestone memory) {
        if (index >= _projects[projectId].milestoneCount) revert InvalidMilestoneIndex();
        return _milestones[projectId][index];
    }

    function getMilestones(uint256 projectId) external view returns (Milestone[] memory list) {
        uint256 n = _projects[projectId].milestoneCount;
        list = new Milestone[](n);
        for (uint256 i; i < n; ++i) list[i] = _milestones[projectId][i];
    }

    /// @notice FR-07: has the full project amount been deposited?
    function isFunded(uint256 projectId) external view returns (bool) {
        ProjectStatus s = _projects[projectId].status;
        return s == ProjectStatus.Funded || s == ProjectStatus.Active || s == ProjectStatus.Disputed || s == ProjectStatus.Completed;
    }

    function projectParties(uint256 projectId) external view returns (address client, address freelancer) {
        Project storage p = _projects[projectId];
        return (p.client, p.freelancer);
    }

    function milestoneAmount(uint256 projectId, uint256 index) external view returns (uint256) {
        return _milestones[projectId][index].amount;
    }

    // ================================================================== internal

    function _createProject(address freelancer, uint96 totalAmount, uint40 deadline, bytes32 metadataHash)
        private
        returns (uint256 projectId)
    {
        if (freelancer == address(0) || freelancer == msg.sender) revert InvalidAddress();
        if (!roles.hasRole(FREELANCER_ROLE, freelancer)) revert MissingRole(FREELANCER_ROLE);
        if (totalAmount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        unchecked { projectId = ++projectCount; }
        Project storage p = _projects[projectId];
        p.client = msg.sender;
        p.deadline = deadline;
        p.status = ProjectStatus.Created;
        p.freelancer = freelancer;
        p.totalAmount = totalAmount;
        emit ProjectCreated(projectId, msg.sender, freelancer, totalAmount, deadline, metadataHash);
    }

    function _addMilestone(uint256 projectId, Project storage p, uint96 amount, uint40 dueDate, bytes32 metadataHash) private {
        if (amount == 0) revert InvalidAmount();
        if (dueDate <= block.timestamp || dueDate > p.deadline) revert InvalidDeadline();
        uint256 allocated = uint256(p.allocatedAmount) + amount;
        if (allocated > p.totalAmount) revert MilestoneTotalMismatch(allocated, p.totalAmount);
        uint256 index = p.milestoneCount;
        _milestones[projectId][index] = Milestone({amount: amount, dueDate: dueDate, submittedAt: 0, status: MilestoneStatus.Pending});
        p.allocatedAmount = uint96(allocated);
        unchecked { p.milestoneCount = uint8(index + 1); }
        emit MilestoneAdded(projectId, index, amount, dueDate, metadataHash);
    }

    function _requireMilestonesComplete(Project storage p) private view {
        if (p.milestoneCount == 0 || p.allocatedAmount != p.totalAmount) {
            revert MilestoneTotalMismatch(p.allocatedAmount, p.totalAmount);
        }
    }

    function _activate(uint256 projectId, Project storage p) private {
        p.status = ProjectStatus.Active;
        emit ProjectActivated(projectId);
    }

    function _load(uint256 projectId, uint256 index) private view returns (Project storage p, Milestone storage m) {
        p = _projects[projectId];
        if (index >= p.milestoneCount) revert InvalidMilestoneIndex();
        m = _milestones[projectId][index];
    }

    /// @dev BR-07: milestone actions need a funded, accepted project. Other milestones keep moving while one is disputed.
    function _requireWorkable(Project storage p) private view {
        if (p.status != ProjectStatus.Active && p.status != ProjectStatus.Disputed) revert InvalidProjectStatus(p.status);
    }

    function _markSubmitted(Milestone storage m) private {
        m.status = MilestoneStatus.Submitted;
        m.submittedAt = uint40(block.timestamp);
    }

    /// @dev Effects first (escrow balance, settled count, completion), then the ETH transfer.
    function _release(uint256 projectId, Project storage p, uint256 index, uint96 amount, address to) private {
        if (p.escrowBalance < amount) revert InsufficientEscrow(p.escrowBalance, amount); // SR-06
        unchecked {
            p.escrowBalance -= amount;
            ++p.settledCount;
        }
        if (to == p.freelancer) emit PaymentReleased(projectId, index, to, amount);
        else emit FundsRefunded(projectId, index, to, amount);
        if (p.settledCount == p.milestoneCount) {
            p.status = ProjectStatus.Completed;
            emit ProjectCompleted(projectId);
        }
        _send(to, amount);
    }

    /// @dev Push ETH; if the recipient rejects it, credit the fallback ledger so the rest of the flow never blocks.
    function _send(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) {
            pendingWithdrawals[to] += amount;
            emit PaymentDeferred(to, amount);
        }
    }
}
