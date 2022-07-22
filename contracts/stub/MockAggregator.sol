// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockAggregator {
    uint8 private _decimals = 8;
    int256 private _price;

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        return (0, _price, 0, 0, 0);
    }

    function setPrice(int256 price) external {
        _price = price;
    }

    function setDecimals(uint8 d) external {
        _decimals = d;
    }
}
