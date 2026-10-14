// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IDisputeManager {
    function openDispute(uint256 projectId, uint256 milestoneIndex, address raisedBy, bytes32 reasonHash)
        external
        returns (uint256 disputeId);
}
