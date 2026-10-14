// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IProjectEscrow} from "./interfaces/IProjectEscrow.sol";

/// @title DisputeManager
/// @notice Records milestone disputes and lets an authorised Arbitrator decide them (Requirements §4.3, §5.4, FR-13, FR-14).
///         The decision is binary: release the milestone amount to the Freelancer, or refund it to the Client.
/// @dev Holds no ETH and has no way to send any: the Arbitrator can only choose between the two parties,
///      never withdraw funds (§4.3 "The Arbitrator shall not be able to freely withdraw project funds").
contract DisputeManager {
    bytes32 private constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");

    enum DisputeStatus { None, Open, Resolved }

    /// @dev slot 1: projectId(8) milestoneIndex(1) status(1) releasedToFreelancer(1) openedAt(5) resolvedAt(5) = 21 bytes
    ///      slot 2: raisedBy(20) amount(12)   slot 3: arbitrator(20)
    struct Dispute {
        uint64 projectId;
        uint8 milestoneIndex;
        DisputeStatus status;
        bool releasedToFreelancer;
        uint40 openedAt;
        uint40 resolvedAt;
        address raisedBy;
        uint96 amount;
        address arbitrator;
    }

    IAccessControl public immutable roles;
    IProjectEscrow public immutable escrow;
    uint64 public disputeCount;
    uint64 public openDisputeCount;
    mapping(uint256 => Dispute) private _disputes;

    error NotAuthorized();
    error MissingRole(bytes32 role);
    error InvalidDisputeStatus(DisputeStatus current);
    error ArbitratorIsParty();
    error InvalidAddress();

    event DisputeOpened(uint256 indexed disputeId, uint256 indexed projectId, uint256 indexed milestoneIndex, address raisedBy, uint256 amount, bytes32 reasonHash);
    event EvidenceSubmitted(uint256 indexed disputeId, address indexed party, bytes32 evidenceHash);
    event DisputeResolved(uint256 indexed disputeId, uint256 indexed projectId, address indexed arbitrator, bool releasedToFreelancer, bytes32 resolutionHash);

    constructor(IAccessControl roleManager, IProjectEscrow projectEscrow) {
        if (address(roleManager) == address(0) || address(projectEscrow) == address(0)) revert InvalidAddress();
        roles = roleManager;
        escrow = projectEscrow;
    }

    /// @notice Called by ProjectEscrow.raiseDispute only.
    function openDispute(uint256 projectId, uint256 milestoneIndex, address raisedBy, bytes32 reasonHash)
        external
        returns (uint256 disputeId)
    {
        if (msg.sender != address(escrow)) revert NotAuthorized();
        uint96 amount = uint96(escrow.milestoneAmount(projectId, milestoneIndex));
        unchecked {
            disputeId = ++disputeCount;
            ++openDisputeCount;
        }
        _disputes[disputeId] = Dispute({
            projectId: uint64(projectId),
            milestoneIndex: uint8(milestoneIndex),
            status: DisputeStatus.Open,
            releasedToFreelancer: false,
            openedAt: uint40(block.timestamp),
            resolvedAt: 0,
            raisedBy: raisedBy,
            amount: amount,
            arbitrator: address(0)
        });
        emit DisputeOpened(disputeId, projectId, milestoneIndex, raisedBy, amount, reasonHash);
    }

    /// @notice TX: Client or Freelancer attaches evidence (hash of an off-chain file or explanation, §13–14).
    function submitEvidence(uint256 disputeId, bytes32 evidenceHash) external {
        Dispute storage d = _disputes[disputeId];
        if (d.status != DisputeStatus.Open) revert InvalidDisputeStatus(d.status);
        (address client, address freelancer) = escrow.projectParties(d.projectId);
        if (msg.sender != client && msg.sender != freelancer) revert NotAuthorized();
        emit EvidenceSubmitted(disputeId, msg.sender, evidenceHash);
    }

    /// @notice TX: an authorised Arbitrator who is not a party decides the dispute (BR-12, SR-03).
    /// @param releaseToFreelancer true = pay the Freelancer, false = refund the Client
    /// @param resolutionHash hash of the written decision stored off-chain
    function resolveDispute(uint256 disputeId, bool releaseToFreelancer, bytes32 resolutionHash) external {
        if (!roles.hasRole(ARBITRATOR_ROLE, msg.sender)) revert MissingRole(ARBITRATOR_ROLE);
        Dispute storage d = _disputes[disputeId];
        if (d.status != DisputeStatus.Open) revert InvalidDisputeStatus(d.status);
        (address client, address freelancer) = escrow.projectParties(d.projectId);
        if (msg.sender == client || msg.sender == freelancer) revert ArbitratorIsParty();

        d.status = DisputeStatus.Resolved;
        d.releasedToFreelancer = releaseToFreelancer;
        d.resolvedAt = uint40(block.timestamp);
        d.arbitrator = msg.sender;
        unchecked { --openDisputeCount; }
        emit DisputeResolved(disputeId, d.projectId, msg.sender, releaseToFreelancer, resolutionHash);

        escrow.executeResolution(d.projectId, d.milestoneIndex, releaseToFreelancer);
    }

    /// @notice Arbitrator dashboard: details of one dispute, including past decisions (§4.3, §11.3).
    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        return _disputes[disputeId];
    }
}
