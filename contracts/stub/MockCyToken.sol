// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/ICToken.sol";
import "./MockToken.sol";

contract MockCyToken is ICToken {
    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _borrowBalances;
    MockToken private _underlying;
    address private _comptroller;
    bool private _borrowFailed;
    bool private _repayFailed;

    constructor(address comptroller_, MockToken underlying_) {
        _comptroller = comptroller_;
        _underlying = underlying_;
        _underlying.mint(address(this), 1000000 * 10**_underlying.decimals());
    }

    function borrow(uint256 borrowAmount) external override returns (uint256) {
        if (_borrowFailed) {
            // Return non-zero value.
            return 1;
        }
        _underlying.transfer(msg.sender, borrowAmount);
        _borrowBalances[msg.sender] =
            _borrowBalances[msg.sender] +
            borrowAmount;
        return 0;
    }

    function repayBorrow(uint256 repayAmount)
        external
        override
        returns (uint256)
    {
        if (_repayFailed) {
            // Return non-zero value.
            return 1;
        }
        _underlying.transferFrom(msg.sender, address(this), repayAmount);
        _borrowBalances[msg.sender] = _borrowBalances[msg.sender] - repayAmount;
        return 0;
    }

    function underlying() external view override returns (address) {
        return address(_underlying);
    }

    function getAccountSnapshot(address account)
        external
        view
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (0, 0, _borrowBalances[account], 0);
    }

    function borrowBalanceCurrent(address account)
        external
        override
        returns (uint256)
    {
        _underlying = _underlying; // Shh
        return _borrowBalances[account];
    }

    function comptroller() external view override returns (address) {
        return _comptroller;
    }

    function setBorrowFailed(bool failed) external {
        _borrowFailed = failed;
    }

    function setRepayFailed(bool failed) external {
        _repayFailed = failed;
    }

    function setBorrowBalance(address account, uint256 balance) external {
        _borrowBalances[account] = balance;
    }
}
