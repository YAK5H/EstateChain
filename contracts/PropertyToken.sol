
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title PropertyToken
/// @notice One ERC-20 share token for a single sample property.
/// @dev These tokens represent simulated shares, not legal ownership of land.
contract PropertyToken is ERC20, ERC20Burnable {
    /// @notice The EstateChain contract allowed to mint and receive approved burns.
    address public immutable marketplace;

    constructor(
        string memory name_,
        string memory symbol_,
        address marketplace_
    ) ERC20(name_, symbol_) {
        require(
            marketplace_ != address(0),
            "Marketplace address is required"
        );
        marketplace = marketplace_;
    }

    /// @notice Whole tokens only.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @notice Create tokens for a buyer.
    function mint(address to, uint256 amount) external {
        require(msg.sender == marketplace, "Only the marketplace can mint");
        _mint(to, amount);
    }
}
