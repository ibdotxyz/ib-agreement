const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBAgreementLens", () => {
  const toWei = ethers.utils.parseEther;
  const usdAddress = '0x0000000000000000000000000000000000000348';

  const collateralFactor = toWei('0.5');
  const liquidationFactor = toWei('0.75');
  const closeFactor = toWei('0.5');
  const collateralCap = 0.8 * 1e8;

  const collateralAmount = 1 * 1e8; // 1 wBTC
  const collateralPrice = '4000000000000'; // 40000 * 1e8
  const collateralAmountUSD = toWei('40000'); // $40000
  const borrowAmount1 = 10000 * 1e6; // 10000 USDT
  const borrowTokenPrice1 = '1000000000000000000000000000000'; // 1e30
  const borrowAmountUSD1 = toWei('10000'); // $10000
  const normalizedCollateralPrice1 = '40000'; // for converter
  const borrowAmount2 = toWei('5'); // 5 wETH
  const borrowTokenPrice2 = toWei('2000'); // 2000 * 1e18
  const borrowAmountUSD2 = toWei('10000'); // $10000
  const normalizedCollateralPrice2 = '20'; // for converter

  let accounts;
  let executor, executorAddress;
  let borrower, borrowerAddress;
  let governor, governorAddress;

  let ibAgreement;
  let lens;
  let underlying1;
  let underlying2;
  let iToken1;
  let iToken2;
  let priceOracle;
  let comptroller;
  let collateral;
  let registry;
  let priceFeed;
  let converter1;
  let converter2;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    executor = accounts[1];
    executorAddress = await executor.getAddress();
    borrower = accounts[2];
    borrowerAddress = await borrower.getAddress();
    governor = accounts[3];
    governorAddress = await governor.getAddress();

    const ibAgreementFactory = await ethers.getContractFactory("IBAgreementV3");
    const lensFactory = await ethers.getContractFactory("IBAgreementLens");
    const tokenFactory = await ethers.getContractFactory("MockToken");
    const iTokenFactory = await ethers.getContractFactory("MockIToken");
    const priceOracleFactory = await ethers.getContractFactory("MockPriceOralce");
    const comptrollerFactory = await ethers.getContractFactory("MockComptroller");
    const registryFactory = await ethers.getContractFactory("MockRegistry");
    const priceFeedFactory = await ethers.getContractFactory("ChainlinkPriceFeedRegistry");
    const converterFactory = await ethers.getContractFactory("MockConverter");

    priceOracle = await priceOracleFactory.deploy();
    comptroller = await comptrollerFactory.deploy(priceOracle.address);
    underlying1 = await tokenFactory.deploy("USD Tether", "USDT", 6);
    underlying2 = await tokenFactory.deploy("Wrapped Ether", "WETH", 18);
    iToken1 = await iTokenFactory.deploy(comptroller.address, underlying1.address);
    iToken2 = await iTokenFactory.deploy(comptroller.address, underlying2.address);
    collateral = await tokenFactory.deploy("Wrapped BTC", "WBTC", 8);
    registry = await registryFactory.deploy();
    priceFeed = await priceFeedFactory.deploy(registry.address, collateral.address, collateral.address, usdAddress);
    ibAgreement = await ibAgreementFactory.deploy(executorAddress, borrowerAddress, governorAddress, comptroller.address, collateral.address, priceFeed.address, collateralFactor, liquidationFactor, closeFactor, 0); // no cap first
    lens = await lensFactory.deploy();

    converter1 = await converterFactory.deploy(collateral.address, underlying1.address);
    converter2 = await converterFactory.deploy(collateral.address, underlying2.address);

    // Configure borrow assets.
    await Promise.all([
      comptroller.setMarketListed(iToken1.address, true),
      comptroller.setMarketListed(iToken2.address, true),
      comptroller.pushAssetsIn(ibAgreement.address, iToken1.address),
      comptroller.pushAssetsIn(ibAgreement.address, iToken2.address),
      priceOracle.setUnderlyingPrice(iToken1.address, borrowTokenPrice1),
      priceOracle.setUnderlyingPrice(iToken2.address, borrowTokenPrice2),
      ibAgreement.connect(executor).setConverter([iToken1.address, iToken2.address], [converter1.address, converter2.address]),
      converter1.setPrice(normalizedCollateralPrice1),
      converter2.setPrice(normalizedCollateralPrice2)
    ]);

    // Configure collateral.
    await Promise.all([
      collateral.mint(ibAgreement.address, collateralAmount),
      registry.setPrice(collateral.address, usdAddress, collateralPrice),
      ibAgreement.connect(governor).setPriceFeed(priceFeed.address)
    ]);

    // Borrow!
    await Promise.all([
      ibAgreement.connect(borrower).borrow(iToken1.address, borrowAmount1),
      ibAgreement.connect(borrower).borrow(iToken2.address, borrowAmount2)
    ])
  });

  it('getBorrowAssetData', async () => {
    const borrowAssetData = await lens.getBorrowAssetData(ibAgreement.address, iToken1.address, priceOracle.address);
    expect(borrowAssetData.market).to.eq(iToken1.address);
    expect(borrowAssetData.borrowBalance).to.eq(borrowAmount1);
    expect(borrowAssetData.borrowBalanceUSD).to.eq(borrowAmountUSD1);
    expect(borrowAssetData.converter).to.eq(converter1.address);
  });

  it('getAllBorrowAssetData', async () => {
    const allBorrowAssetData = await lens.getAllBorrowAssetData(ibAgreement.address);
    expect(allBorrowAssetData.length).to.eq(2);
    expect(allBorrowAssetData[0].market).to.eq(iToken1.address);
    expect(allBorrowAssetData[0].borrowBalance).to.eq(borrowAmount1)
    expect(allBorrowAssetData[0].borrowBalanceUSD).to.eq(borrowAmountUSD1);
    expect(allBorrowAssetData[0].converter).to.eq(converter1.address);
    expect(allBorrowAssetData[1].market).to.eq(iToken2.address);
    expect(allBorrowAssetData[1].borrowBalance).to.eq(borrowAmount2);
    expect(allBorrowAssetData[1].borrowBalanceUSD).to.eq(borrowAmountUSD2);
    expect(allBorrowAssetData[1].converter).to.eq(converter2.address);
  });

  it('getEffectiveCollateralBalance', async () => {
    let collateralBalance = await lens.getEffectiveCollateralBalance(ibAgreement.address);
    expect(collateralBalance).to.eq(collateralAmount);

    await ibAgreement.connect(governor).setCollateralCap(collateralCap);
    collateralBalance = await lens.getEffectiveCollateralBalance(ibAgreement.address);
    expect(collateralBalance).to.eq(collateralCap);
  });

  it('getCollateralData', async () => {
    const collateralData = await lens.getCollateralData(ibAgreement.address);
    expect(collateralData.collateral).to.eq(collateral.address);
    expect(collateralData.collateralBalance).to.eq(collateralAmount);
    expect(collateralData.collateralBalanceUSD).to.eq(collateralAmountUSD);
    expect(collateralData.liquidationThresholdUSD).to.eq(collateralAmountUSD.mul(liquidationFactor).div(toWei('1')));
    expect(collateralData.borrowPowerUSD).to.eq(collateralAmountUSD.mul(collateralFactor).div(toWei('1')));
  });

  it('getIBAgreementData (not liquidatable)', async () => {
    const ibAgreementData = await lens.getIBAgreementData(ibAgreement.address);
    expect(ibAgreementData.allBorrowAssetData.length).to.eq(2);
    expect(ibAgreementData.allBorrowAssetData[0].market).to.eq(iToken1.address);
    expect(ibAgreementData.allBorrowAssetData[0].borrowBalance).to.eq(borrowAmount1)
    expect(ibAgreementData.allBorrowAssetData[0].borrowBalanceUSD).to.eq(borrowAmountUSD1);
    expect(ibAgreementData.allBorrowAssetData[0].converter).to.eq(converter1.address);
    expect(ibAgreementData.allBorrowAssetData[1].market).to.eq(iToken2.address);
    expect(ibAgreementData.allBorrowAssetData[1].borrowBalance).to.eq(borrowAmount2);
    expect(ibAgreementData.allBorrowAssetData[1].borrowBalanceUSD).to.eq(borrowAmountUSD2);
    expect(ibAgreementData.allBorrowAssetData[1].converter).to.eq(converter2.address);
    expect(ibAgreementData.collateralData.collateral).to.eq(collateral.address);
    expect(ibAgreementData.collateralData.collateralBalance).to.eq(collateralAmount);
    expect(ibAgreementData.collateralData.collateralBalanceUSD).to.eq(collateralAmountUSD);
    expect(ibAgreementData.collateralData.liquidationThresholdUSD).to.eq(collateralAmountUSD.mul(liquidationFactor).div(toWei('1')));
    expect(ibAgreementData.collateralData.borrowPowerUSD).to.eq(collateralAmountUSD.mul(collateralFactor).div(toWei('1')));
    expect(ibAgreementData.totalBorrowBalanceUSD).to.eq(borrowAmountUSD1.add(borrowAmountUSD2));
    expect(ibAgreementData.liquidatable).to.eq(false); // Collateral: $40000 * 0.75 = $30000 > Borrow assets: $10000 + $10000  = $20000
  });

  it('getIBAgreementData (liquidatable)', async () => {
    const newCollateralPrice = '2666600000000'; // 26666 * 1e8
    const newCollateralAmountUSD = toWei('26666'); // $26666
    await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);

    const ibAgreementData = await lens.getIBAgreementData(ibAgreement.address);
    expect(ibAgreementData.allBorrowAssetData.length).to.eq(2);
    expect(ibAgreementData.allBorrowAssetData[0].market).to.eq(iToken1.address);
    expect(ibAgreementData.allBorrowAssetData[0].borrowBalance).to.eq(borrowAmount1)
    expect(ibAgreementData.allBorrowAssetData[0].borrowBalanceUSD).to.eq(borrowAmountUSD1);
    expect(ibAgreementData.allBorrowAssetData[0].converter).to.eq(converter1.address);
    expect(ibAgreementData.allBorrowAssetData[1].market).to.eq(iToken2.address);
    expect(ibAgreementData.allBorrowAssetData[1].borrowBalance).to.eq(borrowAmount2);
    expect(ibAgreementData.allBorrowAssetData[1].borrowBalanceUSD).to.eq(borrowAmountUSD2);
    expect(ibAgreementData.allBorrowAssetData[1].converter).to.eq(converter2.address);
    expect(ibAgreementData.collateralData.collateral).to.eq(collateral.address);
    expect(ibAgreementData.collateralData.collateralBalance).to.eq(collateralAmount);
    expect(ibAgreementData.collateralData.collateralBalanceUSD).to.eq(newCollateralAmountUSD);
    expect(ibAgreementData.collateralData.liquidationThresholdUSD).to.eq(newCollateralAmountUSD.mul(liquidationFactor).div(toWei('1')));
    expect(ibAgreementData.collateralData.borrowPowerUSD).to.eq(newCollateralAmountUSD.mul(collateralFactor).div(toWei('1')));
    expect(ibAgreementData.totalBorrowBalanceUSD).to.eq(borrowAmountUSD1.add(borrowAmountUSD2));
    expect(ibAgreementData.liquidatable).to.eq(true); // Collateral: $26666 * 0.75 = $19999.5 < Borrow assets: $10000 + $10000  = $20000
  });

  it('simulateLiquidation', async () => {
    const liquidationAmount = 0.1 * 1e8; // 0.1 wBTC
    const liquidationData = await lens.callStatic.simulateLiquidation(ibAgreement.address, liquidationAmount, iToken1.address);
    expect(liquidationData.collateral).to.eq(collateral.address);
    expect(liquidationData.collateralBalance).to.eq(collateralAmount);
    expect(liquidationData.liquidationAmount).to.eq(liquidationAmount);
    expect(liquidationData.market).to.eq(iToken1.address);
    expect(liquidationData.borrowBalance).to.eq(borrowAmount1);
    expect(liquidationData.repayAmount).to.eq(4000 * 1e6); // 0.1 wBTC * $40000 = 4000 USDT * $1
  });

  it('simulateAllLiquidation', async () => {
    const allLiquidationData = await lens.callStatic.simulateAllLiquidation(ibAgreement.address);
    expect(allLiquidationData.length).to.eq(2);

    // Only borrowed 10000 USDT ($10000), smaller than max liquidation value (0.5 wBTC, $20000), exact repay amount
    // 0.25 wBTC * $40000 = 10000 USDT * $1
    expect(allLiquidationData[0].collateral).to.eq(collateral.address);
    expect(allLiquidationData[0].collateralBalance).to.eq(collateralAmount);
    expect(allLiquidationData[0].liquidationAmount).to.eq(0.25 * 1e8);
    expect(allLiquidationData[0].market).to.eq(iToken1.address);
    expect(allLiquidationData[0].borrowBalance).to.eq(borrowAmount1);
    expect(allLiquidationData[0].repayAmount).to.eq(10000 * 1e6);

    // Only borrowed 5 wETH ($10000), smaller than max liquidation value (0.5 wBTC, $20000), exact repay amount
    // 0.25 wBTC * $40000 = 5 wETH * $2000
    expect(allLiquidationData[1].collateral).to.eq(collateral.address);
    expect(allLiquidationData[1].collateralBalance).to.eq(collateralAmount);
    expect(allLiquidationData[1].liquidationAmount).to.eq(0.25 * 1e8);
    expect(allLiquidationData[1].market).to.eq(iToken2.address);
    expect(allLiquidationData[1].borrowBalance).to.eq(borrowAmount2);
    expect(allLiquidationData[1].repayAmount).to.eq(toWei('5'));
  });
});
