// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Benchmark only (not deployed): measures the optimisations used in ProjectEscrow.
contract GasBench {
    struct PackedJob { address client; uint40 deadline; uint8 status; uint8 milestoneCount; uint8 settledCount; uint8 openDisputes; address freelancer; uint96 totalAmount; uint96 allocatedAmount; uint96 escrowBalance; }
    struct NaiveJob { address client; uint256 deadline; uint256 status; uint256 milestoneCount; uint256 settledCount; uint256 openDisputes; address freelancer; uint256 totalAmount; uint256 allocatedAmount; uint256 escrowBalance; }

    mapping(uint256 => PackedJob) public packed;
    mapping(uint256 => NaiveJob) public naive;
    mapping(uint256 => bytes32) public storedHash;
    uint256 public counter;
    uint256 public counter2;

    error Unauthorized();
    event Stored(uint256 indexed id, bytes32 hash);

    function storePacked(uint256 id) external {
        packed[id] = PackedJob(msg.sender, uint40(block.timestamp + 1 days), 1, 3, 0, 0, address(0xBEEF), 10 ether, 10 ether, 10 ether);
    }

    function storeNaive(uint256 id) external {
        naive[id] = NaiveJob(msg.sender, block.timestamp + 1 days, 1, 3, 0, 0, address(0xBEEF), 10 ether, 10 ether, 10 ether);
    }

    function hashInStorage(uint256 id, bytes32 h) external { storedHash[id] = h; }
    function hashInEvent(uint256 id, bytes32 h) external { emit Stored(id, h); }

    function revertString() external { counter = 1; require(counter == 0, "ProjectEscrow: caller is not authorized"); }
    function revertCustom() external { counter = 1; if (counter != 0) revert Unauthorized(); }

    /// @dev returns gas consumed by each failing call, measured from inside the EVM
    function measureReverts() external returns (uint256 stringCost, uint256 customCost) {
        uint256 g = gasleft();
        try this.revertString() {} catch {}
        stringCost = g - gasleft();
        g = gasleft();
        try this.revertCustom() {} catch {}
        customCost = g - gasleft();
    }

    function loopChecked(uint256 n) external { uint256 c; for (uint256 i = 0; i < n; i++) { c += i; } counter = c; }
    function loopUnchecked(uint256 n) external { uint256 c; for (uint256 i; i < n;) { c += i; unchecked { ++i; } } counter2 = c; }
}
