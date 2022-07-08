// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IConverter {
    function convertExactTokensForTokens(uint256 amountIn, uint256 amountOutMin)
        external
        returns (uint256);

    function convertTokensForExactTokens(uint256 amountOut, uint256 amountInMax)
        external
        returns (uint256);

    function getAmountOut(uint256 amountIn) external returns (uint256);

    function getAmountIn(uint256 amountOut) external returns (uint256);

    function source() external view returns (address);

    function destination() external view returns (address);
}
