// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
    bytes public path;
    address public immutable ibAgreement;

    modifier onlyIBAgreement() {
        require(msg.sender == ibAgreement, "caller is not IB agreement");
        _;
    }

    constructor(
        address _uniswapV3Router,
        address _uniswapV3Quoter,
        address[] memory _paths,
        uint24[] memory _fees,
        address _ibAgreement
    ) {
        uniswapV3Router = ISwapRouter(_uniswapV3Router);
        uniswapV3Quoter = IQuoter(_uniswapV3Quoter);
        _source = _paths[0];
        _destination = _paths[_paths.length - 1];
        paths = _paths;
        fees = _fees;
        ibAgreement = _ibAgreement;

        // encode the path
        for (uint256 i = 0; i < _paths.length; i++) {
            path = abi.encodePacked(path, _paths[i]);
            if (i != _paths.length - 1) {
                path = abi.encodePacked(path, _fees[i]);
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
        return uniswapV3Quoter.quoteExactInput(path, amountIn);
    }

    function getAmountIn(uint256 amountOut)
        external
        override
        returns (uint256)
    {
        return uniswapV3Quoter.quoteExactOutput(path, amountOut);
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
            address(uniswapV3Router),
            amountIn
        );
        ISwapRouter.ExactInputParams memory params = ISwapRouter
            .ExactInputParams({
                path: path,
                recipient: owner(),
                deadline: block.timestamp + 3600, // 1 hour
                amountIn: amountIn,
                amountOutMinimum: amountOutMin
            });
        return uniswapV3Router.exactInput(params);
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
            address(uniswapV3Router),
            amountIn
        );
        ISwapRouter.ExactOutputParams memory params = ISwapRouter
            .ExactOutputParams({
                path: path,
                recipient: owner(),
                deadline: block.timestamp + 3600, // 1 hour
                amountOut: amountOut,
                amountInMaximum: amountInMax
            });
        return uniswapV3Router.exactOutput(params);
    }

    /* ========== ADMIN FUNCTIONS ========== */

    function seize(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, balance);
    }
}
