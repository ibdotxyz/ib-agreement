// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "../interfaces/IConverter.sol";

contract UniswapV3Converter is Ownable, IConverter {
    using SafeERC20 for IERC20;

    ISwapRouter public immutable uniswapV3Router;
    IQuoter public immutable uniswapV3Quoter;
    address private immutable _source;
    address private immutable _destination;
    address[] public paths;
    uint24[] public fees;
    bytes public pathForExactIn;
    bytes public pathForExactOut;

    constructor(
        address _uniswapV3Router,
        address _uniswapV3Quoter,
        address[] memory _paths,
        uint24[] memory _fees
    ) {
        uniswapV3Router = ISwapRouter(_uniswapV3Router);
        uniswapV3Quoter = IQuoter(_uniswapV3Quoter);
        _source = _paths[0];
        _destination = _paths[_paths.length - 1];
        paths = _paths;
        fees = _fees;

        // encode the path
        for (uint256 i = 0; i < _paths.length; i++) {
            pathForExactIn = abi.encodePacked(pathForExactIn, _paths[i]);
            pathForExactOut = abi.encodePacked(_paths[i], pathForExactOut);
            if (i != _paths.length - 1) {
                pathForExactIn = abi.encodePacked(pathForExactIn, _fees[i]);
                pathForExactOut = abi.encodePacked(_fees[i], pathForExactOut);
            }
        }
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
        return uniswapV3Quoter.quoteExactInput(pathForExactIn, amountIn);
    }

    function getAmountIn(uint256 amountOut)
        external
        override
        returns (uint256)
    {
        return uniswapV3Quoter.quoteExactOutput(pathForExactOut, amountOut);
    }

    function convertExactTokensForTokens(uint256 amountIn, uint256 amountOutMin)
        external
        override
        returns (uint256)
    {
        TransferHelper.safeTransferFrom(
            _source,
            msg.sender,
            address(this),
            amountIn
        );
        TransferHelper.safeApprove(_source, address(uniswapV3Router), amountIn);
        ISwapRouter.ExactInputParams memory params = ISwapRouter
            .ExactInputParams({
                path: pathForExactIn,
                recipient: msg.sender,
                deadline: block.timestamp + 3600, // 1 hour
                amountIn: amountIn,
                amountOutMinimum: amountOutMin
            });
        return uniswapV3Router.exactInput(params);
    }

    function convertTokensForExactTokens(uint256 amountOut, uint256 amountInMax)
        external
        override
        returns (uint256)
    {
        TransferHelper.safeTransferFrom(
            _source,
            msg.sender,
            address(this),
            amountInMax
        );
        TransferHelper.safeApprove(
            _source,
            address(uniswapV3Router),
            amountInMax
        );
        ISwapRouter.ExactOutputParams memory params = ISwapRouter
            .ExactOutputParams({
                path: pathForExactOut,
                recipient: msg.sender,
                deadline: block.timestamp + 3600, // 1 hour
                amountOut: amountOut,
                amountInMaximum: amountInMax
            });
        uint256 amountIn = uniswapV3Router.exactOutput(params);
        if (amountIn < amountInMax) {
            TransferHelper.safeApprove(_source, address(uniswapV3Router), 0);
            TransferHelper.safeTransferFrom(
                _source,
                address(this),
                msg.sender,
                amountInMax - amountIn
            );
        }
        return amountIn;
    }

    /* ========== ADMIN FUNCTIONS ========== */

    function seize(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, balance);
    }
}
