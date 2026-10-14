// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IEscrowForMock {
    function acceptProject(uint256 projectId) external;
    function submitMilestone(uint256 projectId, uint256 index, bytes32 deliverableHash) external;
    function approveMilestone(uint256 projectId, uint256 index) external;
    function withdraw() external;
}

interface IRolesForMock {
    function registerAsFreelancer() external;
}

/// @dev Test-only freelancer wallet. Mode 1 rejects ETH (tests the fallback ledger);
///      mode 2 tries to re-enter the escrow when paid (tests ReentrancyGuard).
contract RejectingReceiver {
    IEscrowForMock public immutable escrow;
    uint8 public mode;
    uint256 public reenterProject;
    bytes4 public reentryError;

    constructor(IEscrowForMock escrow_, IRolesForMock roles) {
        escrow = escrow_;
        roles.registerAsFreelancer();
    }

    function setMode(uint8 m, uint256 projectId) external {
        mode = m;
        reenterProject = projectId;
    }

    function accept(uint256 projectId) external { escrow.acceptProject(projectId); }
    function submit(uint256 projectId, uint256 index) external { escrow.submitMilestone(projectId, index, bytes32("work")); }
    function pull() external { escrow.withdraw(); }

    receive() external payable {
        if (mode == 1) revert("no ETH");
        if (mode == 2) {
            // try to approve another milestone from inside the payment; must fail
            try escrow.approveMilestone(reenterProject, 1) {} catch (bytes memory reason) { reentryError = bytes4(reason); }
        }
    }
}
