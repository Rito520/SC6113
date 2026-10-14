// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IProjectEscrow {
    function projectParties(uint256 projectId) external view returns (address client, address freelancer);
    function milestoneAmount(uint256 projectId, uint256 milestoneIndex) external view returns (uint256);
    function executeResolution(uint256 projectId, uint256 milestoneIndex, bool releaseToFreelancer) external;
}
