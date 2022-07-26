// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IBAgreement.sol";

/// @title Provide queries for given IB agreement.
/// @notice Get all the borrow assets and collateral data.
/// @dev These functions are not gas efficient and should _not_ be called on chain.
contract IBAgreementLens {
    struct BorrowAssetData {
        address market;
        uint256 borrowBalance;
        uint256 borrowBalanceUSD;
        address converter;
    }

    struct CollateralData {
        address collateral;
        uint256 collateralBalance;
        uint256 collateralBalanceUSD;
        uint256 liquidationThresholdUSD;
        uint256 borrowPowerUSD;
    }

    struct IBAgreementData {
        BorrowAssetData[] allBorrowAssetData;
        CollateralData collateralData;
        uint256 totalBorrowBalanceUSD;
        bool liquidatable;
    }

    struct LiquidationData {
        address collateral;
        uint256 collateralBalance;
        uint256 liquidationAmount;
        address market;
        uint256 borrowBalance;
        uint256 repayAmount;
    }

    function getBorrowAssetData(
        IBAgreementV3 ibAgreement,
        IIToken market,
        IPriceOracle oracle
    ) public view returns (BorrowAssetData memory) {
        (, , uint256 borrowBalance, ) = market.getAccountSnapshot(
            address(ibAgreement)
        );
        uint256 borrowBalanceUSD = (borrowBalance *
            oracle.getUnderlyingPrice(address(market))) / 1e18;
        return
            BorrowAssetData({
                market: address(market),
                borrowBalance: borrowBalance,
                borrowBalanceUSD: borrowBalanceUSD,
                converter: address(ibAgreement.converters(market))
            });
    }

    function getAllBorrowAssetData(IBAgreementV3 ibAgreement)
        public
        view
        returns (BorrowAssetData[] memory)
    {
        IComptroller comptroller = ibAgreement.comptroller();
        IPriceOracle oracle = IPriceOracle(comptroller.oracle());
        address[] memory borroweAssets = comptroller.getAssetsIn(
            address(ibAgreement)
        );

        BorrowAssetData[] memory allBorrowAssetData = new BorrowAssetData[](
            borroweAssets.length
        );
        for (uint256 i = 0; i < borroweAssets.length; i++) {
            allBorrowAssetData[i] = getBorrowAssetData(
                ibAgreement,
                IIToken(borroweAssets[i]),
                oracle
            );
        }
        return allBorrowAssetData;
    }

    function getEffectiveCollateralBalance(IBAgreementV3 ibAgreement)
        public
        view
        returns (uint256)
    {
        IERC20 collateral = ibAgreement.collateral();
        uint256 collateralBalance = collateral.balanceOf(address(ibAgreement));
        uint256 collateralCap = ibAgreement.collateralCap();
        if (collateralCap != 0 && collateralCap < collateralBalance) {
            collateralBalance = collateralCap;
        }
        return collateralBalance;
    }

    function getCollateralData(IBAgreementV3 ibAgreement)
        public
        view
        returns (CollateralData memory)
    {
        IERC20 collateral = ibAgreement.collateral();
        IPriceFeed priceFeed = ibAgreement.priceFeed();

        // Get the 'effective' collateral balance.
        uint256 collateralBalance = getEffectiveCollateralBalance(ibAgreement);

        uint8 decimals = IERC20Metadata(address(collateral)).decimals();
        uint256 normalizedAmount = collateralBalance * 10**(18 - decimals);
        uint256 collateralBalanceUSD = (normalizedAmount *
            priceFeed.getPrice()) / 1e18;
        uint256 borrowPowerUSD = (collateralBalanceUSD *
            ibAgreement.collateralFactor()) / 1e18;
        uint256 liquidationThresholdUSD = (collateralBalanceUSD *
            ibAgreement.liquidationFactor()) / 1e18;

        return
            CollateralData({
                collateral: address(collateral),
                collateralBalance: collateralBalance,
                collateralBalanceUSD: collateralBalanceUSD,
                liquidationThresholdUSD: liquidationThresholdUSD,
                borrowPowerUSD: borrowPowerUSD
            });
    }

    function getIBAgreementData(IBAgreementV3 ibAgreement)
        public
        view
        returns (IBAgreementData memory)
    {
        BorrowAssetData[] memory allBorrowAssetData = getAllBorrowAssetData(
            ibAgreement
        );
        CollateralData memory collateralData = getCollateralData(ibAgreement);
        uint256 totalBorrowBalanceUSD = 0;
        for (uint256 i = 0; i < allBorrowAssetData.length; i++) {
            totalBorrowBalanceUSD += allBorrowAssetData[i].borrowBalanceUSD;
        }
        bool liquidatable = totalBorrowBalanceUSD >
            collateralData.liquidationThresholdUSD;
        return
            IBAgreementData({
                allBorrowAssetData: allBorrowAssetData,
                collateralData: collateralData,
                totalBorrowBalanceUSD: totalBorrowBalanceUSD,
                liquidatable: liquidatable
            });
    }

    function simulateLiquidation(
        IBAgreementV3 ibAgreement,
        uint256 liquidationAmount,
        IIToken market
    ) public returns (LiquidationData memory) {
        // Get the 'effective' collateral balance.
        uint256 collateralBalance = getEffectiveCollateralBalance(ibAgreement);
        require(
            liquidationAmount <=
                (collateralBalance * ibAgreement.closeFactor()) / 1e18,
            "liquidate too much"
        );

        (, , uint256 borrowBalance, ) = market.getAccountSnapshot(
            address(ibAgreement)
        );

        IConverter converter = ibAgreement.converters(market);
        uint256 repayAmount = converter.getAmountOut(liquidationAmount);
        if (repayAmount > borrowBalance) {
            // Repay too much. Need to simulate again with exact repay amount.
            repayAmount = borrowBalance;
            liquidationAmount = converter.getAmountIn(repayAmount);
        }
        return
            LiquidationData({
                collateral: address(ibAgreement.collateral()),
                collateralBalance: collateralBalance,
                liquidationAmount: liquidationAmount,
                market: address(market),
                borrowBalance: borrowBalance,
                repayAmount: repayAmount
            });
    }

    function simulateAllLiquidation(IBAgreementV3 ibAgreement)
        public
        returns (LiquidationData[] memory)
    {
        IComptroller comptroller = ibAgreement.comptroller();
        address[] memory borroweAssets = comptroller.getAssetsIn(
            address(ibAgreement)
        );

        LiquidationData[] memory allLiquidationData = new LiquidationData[](
            borroweAssets.length
        );
        for (uint256 i = 0; i < borroweAssets.length; i++) {
            // Get the 'effective' collateral balance.
            uint256 collateralBalance = getEffectiveCollateralBalance(
                ibAgreement
            );
            uint256 maxLiquidationAmount = (collateralBalance *
                ibAgreement.closeFactor()) / 1e18;
            allLiquidationData[i] = simulateLiquidation(
                ibAgreement,
                maxLiquidationAmount,
                IIToken(borroweAssets[i])
            );
        }
        return allLiquidationData;
    }
}
