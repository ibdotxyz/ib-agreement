// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IConverter.sol";
import "../interfaces/IUniswapV2Factory.sol";
import "../interfaces/IUniswapV2Pair.sol";

contract Converter is Ownable, IConverter {
    using SafeERC20 for IERC20;

    address public immutable override source;
    address public immutable override destination;
    IUniswapV2Factory public immutable factory;
    mapping(address => address) public bridges;

    event Convert(
        address indexed fromToken,
        address indexed toToken,
        uint256 fromAmount,
        uint256 toAmount
    );
    event BridgeSet(address indexed token, address indexed bridge);

    constructor(
        address _source,
        address _destination,
        address _factory
    ) {
        source = _source;
        destination = _destination;
        factory = IUniswapV2Factory(_factory);
    }

    /**
     * @notice Convert the source token to the destination token.
     * @param amount The amount of source token
     */
    function convert(uint256 amount) external override {
        convertInternal(source, amount, msg.sender);
    }

    /* Internal functions */

    /**
     * @notice Convert token internally.
     * @param token The token address
     * @param amountIn The amount needs to be converted
     * @param receiver The receiver after the swap
     * @return amountOut The amount after the conversion
     */
    function convertInternal(
        address token,
        uint256 amountIn,
        address receiver
    ) internal returns (uint256 amountOut) {
        if (token == destination) {
            // If it's the destination token, send it to the receiver directly.
            IERC20(token).safeTransfer(receiver, amountIn);
            amountOut = amountIn;
        } else {
            // If it's other token, try to swap the token to other token.
            address bridgeToken = bridges[token];
            amountOut = convertInternal(
                bridgeToken,
                swap(token, bridgeToken, amountIn, address(this)),
                receiver
            );
        }
    }

    /**
     * @notice Swap fromToken using the given pairAddress
     * @param fromToken The from token
     * @param toToken The to token
     * @param amountIn The amount of fromToken needs to be swapped
     * @param receiver The receiver after the swap
     * @return amountOut The amount of toToken that will be sent to the receiver
     */
    function swap(
        address fromToken,
        address toToken,
        uint256 amountIn,
        address receiver
    ) internal returns (uint256 amountOut) {
        IUniswapV2Pair pair = IUniswapV2Pair(
            factory.getPair(fromToken, toToken)
        );
        require(address(pair) != address(0), "invalid pair");

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();

        if (fromToken == pair.token0()) {
            amountOut = getAmountOut(amountIn, reserve0, reserve1);
            IERC20(fromToken).safeTransfer(address(pair), amountIn);
            pair.swap(0, amountOut, receiver, new bytes(0));
        } else {
            amountOut = getAmountOut(amountIn, reserve1, reserve0);
            IERC20(fromToken).safeTransfer(address(pair), amountIn);
            pair.swap(amountOut, 0, receiver, new bytes(0));
        }
        emit Convert(fromToken, toToken, amountIn, amountOut);
    }

    /**
     * @notice Calculate swap output amount based on input amount and reserves
     * @param amountIn The token amount to swap
     * @param reserveIn Reserve of input token in the pair
     * @param reserveOut Reserve of output token in the pair
     * @return amountOut Calculated swap output token amount
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /* Admin functions */

    /**
     * @notice Set the bridge for a token.
     * @param token The token address
     * @param bridge The bridge of the token
     */
    function setBridge(address token, address bridge) external onlyOwner {
        bridges[token] = bridge;
        emit BridgeSet(token, bridge);
    }

    /**
     * @notice Seize tokens to the contract owner.
     * @param token The token address
     * @param amount The amount
     */
    function seize(IERC20 token, uint256 amount) external onlyOwner {
        token.safeTransfer(owner(), amount);
    }
}
