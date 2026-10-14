// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title RoleManager
/// @notice Single source of truth for platform roles (Requirements §4, FR-02, SR-01).
///         Clients and Freelancers register themselves with their wallet (no real-world identity check, §3).
///         Arbitrators are authorised only by an Admin.
/// @dev The other contracts ask `hasRole` here, so a role revoked in this contract stops working everywhere at once.
contract RoleManager is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CLIENT_ROLE = keccak256("CLIENT_ROLE");
    bytes32 public constant FREELANCER_ROLE = keccak256("FREELANCER_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");

    error AlreadyRegistered(address account, bytes32 role);
    error ArbitratorCannotRegister(address account);

    event UserRegistered(address indexed account, bytes32 indexed role);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _setRoleAdmin(CLIENT_ROLE, ADMIN_ROLE);
        _setRoleAdmin(FREELANCER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(ARBITRATOR_ROLE, ADMIN_ROLE);
    }

    /// @notice TX: a wallet registers itself as a Client.
    function registerAsClient() external {
        _register(CLIENT_ROLE);
    }

    /// @notice TX: a wallet registers itself as a Freelancer.
    function registerAsFreelancer() external {
        _register(FREELANCER_ROLE);
    }

    /// @notice For the frontend: which dashboards should this wallet see? (FR-02, FR-17)
    function rolesOf(address account) external view returns (bool admin, bool client, bool freelancer, bool arbitrator) {
        return (
            hasRole(ADMIN_ROLE, account),
            hasRole(CLIENT_ROLE, account),
            hasRole(FREELANCER_ROLE, account),
            hasRole(ARBITRATOR_ROLE, account)
        );
    }

    function _register(bytes32 role) private {
        // keeps arbitrators neutral: an arbitrator wallet cannot also trade on the platform
        if (hasRole(ARBITRATOR_ROLE, msg.sender)) revert ArbitratorCannotRegister(msg.sender);
        if (hasRole(role, msg.sender)) revert AlreadyRegistered(msg.sender, role);
        _grantRole(role, msg.sender);
        emit UserRegistered(msg.sender, role);
    }
}
