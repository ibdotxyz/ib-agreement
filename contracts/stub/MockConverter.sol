// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/IConverter.sol";
import "./MockToken.sol";

contract MockConverter is IConverter {
    address private _source;
    address private _destination;
    uint256 private _price;

    constructor(address source_, address destination_) {
        _source = source_;
        _destination = destination_;
        MockToken(_destination).mint(
            address(this),
            1000000 * 10**MockToken(_destination).decimals()
        );
    }

    function source() external view override returns (address) {
        return _source;
    }

    function destination() external view override returns (address) {
        return _destination;
    }

    function convertExactTokensForTokens(uint256 amountIn, uint256 amountOutMin)
        external
        override
        returns (uint256)
    {
        uint256 amountOut = this.getAmountOut(amountIn);
        require(amountOut > amountOutMin, "insufficient amount out");
        MockToken(_source).transferFrom(msg.sender, address(this), amountIn);
        MockToken(_destination).transfer(msg.sender, amountOut);
        return amountOut;
    }

    function convertTokensForExactTokens(uint256 amountOut, uint256 amountInMax)
        external
        override
        returns (uint256)
    {
        uint256 amountIn = this.getAmountIn(amountOut);
        require(amountIn < amountInMax, "excessive amount in");
        MockToken(_source).transferFrom(msg.sender, address(this), amountIn);
        MockToken(_destination).transfer(msg.sender, amountOut);
        return amountIn;
    }

    function getAmountOut(uint256 amountIn)
        external
        override
        returns (uint256)
    {
        _source = _source; // Shh
        // For simplicity, trade with fixed price.
        uint256 amountOut = (amountIn *
            _price *
            10**MockToken(_destination).decimals()) /
            10**MockToken(_source).decimals();
        return amountOut;
    }

    function getAmountIn(uint256 amountOut)
        external
        override
        returns (uint256)
    {
        _source = _source; // Shh
        // For simplicity, trade with fixed price.
        uint256 amountIn = (amountOut * 10**MockToken(_source).decimals()) /
            10**MockToken(_destination).decimals() /
            _price;
        return amountIn;
    }

    function setPrice(uint256 price) external {
        _price = price;
    }
}
