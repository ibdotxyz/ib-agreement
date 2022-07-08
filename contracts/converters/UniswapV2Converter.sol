// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";
import "../interfaces/IConverter.sol";

contract UniswapV2Converter is Ownable, IConverter {
    using SafeERC20 for IERC20;

    IUniswapV2Router01 public immutable uniswapV2Router;
    address private immutable _source;
    address private immutable _destination;
    address[] public paths;
    address public immutable ibAgreement;

    modifier onlyIBAgreement() {
        require(msg.sender == ibAgreement, "caller is not IB agreement");
        _;
    }

    constructor(
        address _uniswapV2Router,
        address[] memory _paths,
        address _ibAgreement
    ) {
        uniswapV2Router = IUniswapV2Router01(_uniswapV2Router);
        _source = _paths[0];
        _destination = _paths[_paths.length - 1];
        paths = _paths;
        ibAgreement = _ibAgreement;
    }

    /* ========== VIEW FUNCTIONS ========== */

    function source() external view override returns (address) {
        return _source;
    }

    function destination() external view override returns (address) {
        return _destination;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function getAmountOut(uint256 amountIn)
        external
        override
        returns (uint256)
    {
        paths = paths; // Shh
        return uniswapV2Router.getAmountsOut(amountIn, paths)[paths.length - 1];
    }

    function getAmountIn(uint256 amountOut)
        external
        override
        returns (uint256)
    {
        paths = paths; // Shh
        return uniswapV2Router.getAmountsIn(amountOut, paths)[0];
    }

    function convertExactTokensForTokens(uint256 amountIn, uint256 amountOutMin)
        external
        override
        onlyIBAgreement
        returns (uint256)
    {
        uint256 amountOut = this.getAmountOut(amountIn);
        require(amountOut >= amountOutMin, "insufficient output amount");

        IERC20(_source).safeTransferFrom(ibAgreement, address(this), amountIn);
        IERC20(_source).safeIncreaseAllowance(
            address(uniswapV2Router),
            amountIn
        );
        uint256[] memory amountsOut = uniswapV2Router.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            paths,
            owner(),
            block.timestamp + 3600 // 1 hour
        );
        return amountsOut[paths.length - 1];
    }

    function convertTokensForExactTokens(uint256 amountOut, uint256 amountInMax)
        external
        override
        onlyIBAgreement
        returns (uint256)
    {
        uint256 amountIn = this.getAmountIn(amountOut);
        require(amountIn <= amountInMax, "excessive input amount");

        IERC20(_source).safeTransferFrom(ibAgreement, address(this), amountIn);
        IERC20(_source).safeIncreaseAllowance(
            address(uniswapV2Router),
            amountIn
        );
        uint256[] memory amountsIn = uniswapV2Router.swapTokensForExactTokens(
            amountOut,
            amountInMax,
            paths,
            owner(),
            block.timestamp + 3600 // 1 hour
        );
        return amountsIn[0];
    }

    /* ========== ADMIN FUNCTIONS ========== */

    function seize(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, balance);
    }
}
