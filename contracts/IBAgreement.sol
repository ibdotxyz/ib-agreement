// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IComptroller.sol";
import "./interfaces/IConverter.sol";
import "./interfaces/IIToken.sol";
import "./interfaces/IPriceFeed.sol";
import "./interfaces/IPriceOracle.sol";

contract IBAgreementV3 is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    address public immutable executor;
    address public immutable borrower;
    address public immutable governor;
    IComptroller public immutable comptroller;
    IERC20 public immutable collateral;
    uint256 public immutable collateralFactor;
    uint256 public immutable liquidationFactor;
    uint256 public immutable closeFactor;
    uint256 public collateralCap;
    IPriceFeed public priceFeed;
    mapping(IIToken => IConverter) public converters;

    modifier onlyBorrower() {
        require(msg.sender == borrower, "caller is not the borrower");
        _;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor, "caller is not the executor");
        _;
    }

    modifier onlyGovernor() {
        require(msg.sender == governor, "caller is not the governor");
        _;
    }

    /**
     * @dev Sets the values for {executor}, {borrower}, {governor}, {comptroller}, {collateral}, {priceFeed}, {collateralFactor}, {liquidationFactor}, {closeFactor}, and {collateralCap}.
     *
     * {collateral} must be a vanilla ERC20 token.
     *
     * All of these values except {priceFeed} and {collateralCap} are immutable: they can only be set once during construction.
     */
    constructor(
        address _executor,
        address _borrower,
        address _governor,
        address _comptroller,
        address _collateral,
        address _priceFeed,
        uint256 _collateralFactor,
        uint256 _liquidationFactor,
        uint256 _closeFactor,
        uint256 _collateralCap
    ) {
        executor = _executor;
        borrower = _borrower;
        governor = _governor;
        comptroller = IComptroller(_comptroller);
        collateral = IERC20(_collateral);
        priceFeed = IPriceFeed(_priceFeed);
        collateralFactor = _collateralFactor;
        liquidationFactor = _liquidationFactor;
        closeFactor = _closeFactor;
        collateralCap = _collateralCap;

        require(_collateral == priceFeed.getToken(), "mismatch price feed");
        require(
            _collateralFactor > 0 && _collateralFactor <= 1e18,
            "invalid collateral factor"
        );
        require(
            _liquidationFactor >= _collateralFactor &&
                _liquidationFactor <= 1e18,
            "invalid liquidation factor"
        );
        require(
            _closeFactor > 0 && _closeFactor <= 1e18,
            "invalid close factor"
        );
    }

    /**
     * @notice Get the current debt in USD value of this contract
     * @return The borrow balance in USD value
     */
    function debtUSD() external view returns (uint256) {
        return getHypotheticalDebtValue(address(0), 0);
    }

    /**
     * @notice Get the hypothetical debt in USD value of this contract after borrow
     * @param market The market
     * @param borrowAmount The hypothetical borrow amount
     * @return The hypothetical debt in USD value
     */
    function hypotheticalDebtUSD(IIToken market, uint256 borrowAmount)
        external
        view
        returns (uint256)
    {
        return getHypotheticalDebtValue(address(market), borrowAmount);
    }

    /**
     * @notice Get the max value in USD to use for borrow in this contract
     * @return The USD value
     */
    function collateralUSD() external view returns (uint256) {
        uint256 value = getHypotheticalCollateralValue(0);
        return (value * collateralFactor) / 1e18;
    }

    /**
     * @notice Get the hypothetical max value in USD to use for borrow in this contract after withdraw
     * @param withdrawAmount The hypothetical withdraw amount
     * @return The hypothetical USD value
     */
    function hypotheticalCollateralUSD(uint256 withdrawAmount)
        external
        view
        returns (uint256)
    {
        uint256 value = getHypotheticalCollateralValue(withdrawAmount);
        return (value * collateralFactor) / 1e18;
    }

    /**
     * @notice Get the lquidation threshold. It represents the max value of collateral that we recongized.
     * @dev If the debt is greater than the liquidation threshold, this agreement is liquidatable.
     * @return The lquidation threshold
     */
    function liquidationThreshold() external view returns (uint256) {
        uint256 value = getHypotheticalCollateralValue(0);
        return (value * liquidationFactor) / 1e18;
    }

    /**
     * @notice Borrow from market if the collateral is sufficient
     * @param market The market
     * @param amount The borrow amount
     */
    function borrow(IIToken market, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyBorrower
    {
        borrowInternal(market, amount);
    }

    /**
     * @notice Borrow max from market with current price
     * @param market The market
     */
    function borrowMax(IIToken market)
        external
        nonReentrant
        whenNotPaused
        onlyBorrower
    {
        (, , uint256 borrowBalance, ) = market.getAccountSnapshot(
            address(this)
        );

        IPriceOracle oracle = IPriceOracle(comptroller.oracle());

        uint256 maxBorrowAmount = (this.collateralUSD() * 1e18) /
            oracle.getUnderlyingPrice(address(market));
        require(maxBorrowAmount > borrowBalance, "undercollateralized");
        borrowInternal(market, maxBorrowAmount - borrowBalance);
    }

    /**
     * @notice Withdraw the collateral if sufficient
     * @param amount The withdraw amount
     */
    function withdraw(uint256 amount) external nonReentrant onlyBorrower {
        uint256 debt = this.debtUSD();
        if (debt != 0) {
            // If there is still debt, must be unpaused and undercollateralized to withdraw.
            _requireNotPaused();
            require(
                debt <= this.hypotheticalCollateralUSD(amount),
                "undercollateralized"
            );
        }
        collateral.safeTransfer(borrower, amount);
    }

    /**
     * @notice Repay the debts
     * @param market The market
     * @param amount The repay amount
     */
    function repay(IIToken market, uint256 amount)
        external
        nonReentrant
        onlyBorrower
    {
        IERC20 underlying = IERC20(market.underlying());
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        repayInternal(market, amount);
    }

    /**
     * @notice Fully repay the debts
     * @param market The market
     */
    function repayFull(IIToken market) external nonReentrant onlyBorrower {
        // Get the current borrow balance including interests.
        uint256 borrowBalance = market.borrowBalanceCurrent(address(this));

        IERC20 underlying = IERC20(market.underlying());
        underlying.safeTransferFrom(msg.sender, address(this), borrowBalance);
        repayInternal(market, borrowBalance);
    }

    /**
     * @notice Seize the tokens
     * @param token The token
     * @param amount The amount
     */
    function seize(IERC20 token, uint256 amount) external onlyExecutor {
        require(
            address(token) != address(collateral),
            "seize collateral not allow"
        );
        token.safeTransfer(executor, amount);
    }

    /**
     * @notice Liquidate with exact collateral amount for a given market
     * @param market The market
     * @param collateralAmount The collateral amount for liquidation
     * @param repayAmountMin The min repay amount after conversion
     */
    function liquidateWithExactCollateralAmount(
        IIToken market,
        uint256 collateralAmount,
        uint256 repayAmountMin
    ) external onlyExecutor {
        checkLiquidatable(market);

        require(
            collateralAmount <=
                (getHypotheticalCollateralBalance(0) * closeFactor) / 1e18,
            "liquidate too much"
        );

        // Approve and convert.
        IERC20(collateral).safeIncreaseAllowance(
            address(converters[market]),
            collateralAmount
        );
        uint256 amountOut = converters[market].convertExactTokensForTokens(
            collateralAmount,
            repayAmountMin
        );

        // Repay the debts.
        repayInternal(market, amountOut);
    }

    /**
     * @notice Liquidate for exact repay amount for a given market
     * @param market The market
     * @param repayAmount The desired repay amount
     * @param collateralAmountMax The max collateral amount for liquidation
     */
    function liquidateForExactRepayAmount(
        IIToken market,
        uint256 repayAmount,
        uint256 collateralAmountMax
    ) external onlyExecutor {
        checkLiquidatable(market);

        uint256 amountIn = converters[market].getAmountIn(repayAmount);
        require(amountIn <= collateralAmountMax, "too much collateral needed");

        require(
            amountIn <=
                (getHypotheticalCollateralBalance(0) * closeFactor) / 1e18,
            "liquidate too much"
        );

        // Approve and convert.
        IERC20(collateral).safeIncreaseAllowance(
            address(converters[market]),
            amountIn
        );
        converters[market].convertTokensForExactTokens(
            repayAmount,
            collateralAmountMax
        );

        // Repay the debts.
        repayInternal(market, repayAmount);
    }

    /**
     * @notice Set the converter for liquidation
     * @param _markets The markets
     * @param _converters The converters
     */
    function setConverter(
        IIToken[] calldata _markets,
        IConverter[] calldata _converters
    ) external onlyExecutor {
        require(_markets.length == _converters.length, "length mismatch");
        for (uint256 i = 0; i < _markets.length; i++) {
            require(address(_converters[i]) != address(0), "empty converter");
            require(
                _converters[i].source() == address(collateral),
                "mismatch source token"
            );
            require(
                _converters[i].destination() == _markets[i].underlying(),
                "mismatch destination token"
            );
            converters[_markets[i]] = IConverter(_converters[i]);
        }
    }

    /**
     * @notice Pause the IB Agreement
     */
    function pause() external onlyExecutor {
        _pause();
    }

    /**
     * @notice Unpause the IB Agreement
     */
    function unpause() external onlyExecutor {
        _unpause();
    }

    /**
     * @notice Set the collateral cap
     * @param _collateralCap The new cap
     */
    function setCollateralCap(uint256 _collateralCap) external onlyGovernor {
        collateralCap = _collateralCap;
    }

    /**
     * @notice Set the price feed of the collateral
     * @param _priceFeed The new price feed
     */
    function setPriceFeed(address _priceFeed) external onlyGovernor {
        require(
            address(collateral) == IPriceFeed(_priceFeed).getToken(),
            "mismatch price feed"
        );

        priceFeed = IPriceFeed(_priceFeed);
    }

    /* Internal functions */

    /**
     * @notice Get the current collateral balance, min(balance, cap)
     * @param withdrawAmount The hypothetical withdraw amount
     * @return The collateral balance
     */
    function getHypotheticalCollateralBalance(uint256 withdrawAmount)
        internal
        view
        returns (uint256)
    {
        uint256 balance = collateral.balanceOf(address(this)) - withdrawAmount;
        if (collateralCap != 0 && collateralCap <= balance) {
            balance = collateralCap;
        }
        return balance;
    }

    /**
     * @notice Get the current debt of this contract
     * @param borrowMarket The hypothetical borrow market
     * @param borrowAmount The hypothetical borrow amount
     * @return The borrow balance
     */
    function getHypotheticalDebtValue(
        address borrowMarket,
        uint256 borrowAmount
    ) internal view returns (uint256) {
        uint256 debt;
        address[] memory borrowedAssets = comptroller.getAssetsIn(
            address(this)
        );
        IPriceOracle oracle = IPriceOracle(comptroller.oracle());
        for (uint256 i = 0; i < borrowedAssets.length; i++) {
            IIToken market = IIToken(borrowedAssets[i]);
            uint256 amount;
            (, , uint256 borrowBalance, ) = market.getAccountSnapshot(
                address(this)
            );
            if (address(market) == borrowMarket) {
                amount = borrowBalance + borrowAmount;
            } else {
                amount = borrowBalance;
            }
            debt +=
                (amount * oracle.getUnderlyingPrice(address(market))) /
                1e18;
        }
        return debt;
    }

    /**
     * @notice Get the hypothetical collateral in USD value in this contract after withdraw
     * @param withdrawAmount The hypothetical withdraw amount
     * @return The hypothetical collateral in USD value
     */
    function getHypotheticalCollateralValue(uint256 withdrawAmount)
        internal
        view
        returns (uint256)
    {
        uint256 balance = getHypotheticalCollateralBalance(withdrawAmount);
        uint8 decimals = IERC20Metadata(address(collateral)).decimals();
        uint256 normalizedBalance = balance * 10**(18 - decimals);
        return (normalizedBalance * priceFeed.getPrice()) / 1e18;
    }

    /**
     * @notice Check if the market is liquidatable
     * @param market The market
     */
    function checkLiquidatable(IIToken market) internal view {
        IERC20 underlying = IERC20(market.underlying());
        require(
            this.debtUSD() > this.liquidationThreshold(),
            "not liquidatable"
        );
        require(address(converters[market]) != address(0), "empty converter");
        require(
            converters[market].source() == address(collateral),
            "mismatch source token"
        );
        require(
            converters[market].destination() == address(underlying),
            "mismatch destination token"
        );
    }

    /**
     * @notice Borrow from market
     * @param market The market
     * @param _amount The borrow amount
     */
    function borrowInternal(IIToken market, uint256 _amount) internal {
        require(
            getHypotheticalDebtValue(address(market), _amount) <=
                this.collateralUSD(),
            "undercollateralized"
        );
        require(market.borrow(_amount) == 0, "borrow failed");
        IERC20(market.underlying()).safeTransfer(borrower, _amount);
    }

    /**
     * @notice Repay the debts
     * @param _amount The repay amount
     */
    function repayInternal(IIToken market, uint256 _amount) internal {
        IERC20(market.underlying()).safeIncreaseAllowance(
            address(market),
            _amount
        );
        require(market.repayBorrow(_amount) == 0, "repay failed");
    }
}
