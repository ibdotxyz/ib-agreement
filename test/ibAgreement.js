const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBAgreement", () => {
  const toWei = ethers.utils.parseEther;
  const usdAddress = '0x0000000000000000000000000000000000000348';

  const collateralFactor = toWei('0.5');
  const liquidationFactor = toWei('0.75');
  const closeFactor = toWei('0.5');
  const collateralCap = 1 * 1e8;

  let accounts;
  let executor, executorAddress;
  let borrower, borrowerAddress;
  let governor, governorAddress;

  let ibAgreement;
  let underlying;
  let underlying2;
  let iToken;
  let iToken2;
  let priceOracle;
  let comptroller;
  let collateral;
  let registry;
  let priceFeed;
  let token;
  let converter;
  let converter2;
  let invalidConverter;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    executor = accounts[1];
    executorAddress = await executor.getAddress();
    borrower = accounts[2];
    borrowerAddress = await borrower.getAddress();
    governor = accounts[3];
    governorAddress = await governor.getAddress();

    const ibAgreementFactory = await ethers.getContractFactory("IBAgreementV3");
    const tokenFactory = await ethers.getContractFactory("MockToken");
    const iTokenFactory = await ethers.getContractFactory("MockIToken");
    const priceOracleFactory = await ethers.getContractFactory("MockPriceOralce");
    const comptrollerFactory = await ethers.getContractFactory("MockComptroller");
    const registryFactory = await ethers.getContractFactory("MockRegistry");
    const priceFeedFactory = await ethers.getContractFactory("ChainlinkPriceFeedRegistry");
    const converterFactory = await ethers.getContractFactory("MockConverter");

    priceOracle = await priceOracleFactory.deploy();
    comptroller = await comptrollerFactory.deploy(priceOracle.address);
    underlying = await tokenFactory.deploy("USD Tether", "USDT", 6);
    underlying2 = await tokenFactory.deploy("Wrapped Ether", "WETH", 18);
    iToken = await iTokenFactory.deploy(comptroller.address, underlying.address);
    iToken2 = await iTokenFactory.deploy(comptroller.address, underlying2.address);
    collateral = await tokenFactory.deploy("Wrapped BTC", "WBTC", 8);
    registry = await registryFactory.deploy();
    priceFeed = await priceFeedFactory.deploy(registry.address, collateral.address, collateral.address, usdAddress);
    ibAgreement = await ibAgreementFactory.deploy(executorAddress, borrowerAddress, governorAddress, comptroller.address, collateral.address, priceFeed.address, collateralFactor, liquidationFactor, closeFactor, collateralCap);
    await comptroller.setMarketListed(iToken.address, true);
    await comptroller.pushAssetsIn(ibAgreement.address, iToken.address);

    token = await tokenFactory.deploy("Token", "TOKEN", 18);
    converter = await converterFactory.deploy(collateral.address, underlying.address);
    converter2 = await converterFactory.deploy(collateral.address, underlying2.address);
    invalidConverter = await converterFactory.deploy(token.address, underlying.address);
  });

  describe('debtUSD / hypotheticalDebtUSD', () => {
    const debt = 5000 * 1e6; // 5000 USDT
    const price = '1000000000000000000000000000000'; // 1e30

    beforeEach(async () => {
      await Promise.all([
        iToken.setBorrowBalance(ibAgreement.address, debt),
        priceOracle.setUnderlyingPrice(iToken.address, price)
      ]);
    });

    it('shows the debt in USD value', async () => {
      expect(await ibAgreement.debtUSD()).to.eq(toWei('5000'));
    });

    it('shows the hypothetical debt in USD value', async () => {
      const borrowAmount = 1000 * 1e6; // 1000 USDT
      expect(await ibAgreement.hypotheticalDebtUSD(iToken.address, borrowAmount)).to.eq(toWei('6000'));
    });
  });

  describe('collateralUSD / hypotheticalCollateralUSD / liquidationThreshold', () => {
    const amount = 1 * 1e8; // 1 wBTC
    const price = '4000000000000'; // 40000 * 1e8

    beforeEach(async () => {
      await Promise.all([
        collateral.mint(ibAgreement.address, amount),
        registry.setPrice(collateral.address, usdAddress, price),
        ibAgreement.connect(governor).setPriceFeed(priceFeed.address)
      ]);
    });

    it('shows the collateral in USD value', async () => {
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('20000')); // CF: 50%
    });

    it('shows the collateral in USD value with cap', async () => {
      const cap = 0.5 * 1e8; // 0.5 wBTC
      await ibAgreement.connect(governor).setCollateralCap(cap);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('10000'));
    });

    it('shows the hypothetical debt in USD value', async () => {
      const withdrawAmount = 0.5 * 1e8; // 0.5 wBTC
      expect(await ibAgreement.hypotheticalCollateralUSD(withdrawAmount)).to.eq(toWei('10000')); // CF: 50%
    });

    it('shows the hypothetical debt in USD value with cap', async () => {
      const cap = 0.5 * 1e8; // 0.5 wBTC
      await ibAgreement.connect(governor).setCollateralCap(cap);

      let withdrawAmount = 0.3 * 1e8; // 0.3 wBTC
      expect(await ibAgreement.hypotheticalCollateralUSD(withdrawAmount)).to.eq(toWei('10000'));
      withdrawAmount = 0.5 * 1e8; // 0.5 wBTC
      expect(await ibAgreement.hypotheticalCollateralUSD(withdrawAmount)).to.eq(toWei('10000'));
      withdrawAmount = 0.7 * 1e8; // 0.7 wBTC
      expect(await ibAgreement.hypotheticalCollateralUSD(withdrawAmount)).to.eq(toWei('6000'));
    });

    it('show the liquidation threshold', async () => {
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('30000')); // LF: 75%
    });

    it('show the liquidation threshold with cap', async () => {
      const cap = 0.5 * 1e8; // 0.5 wBTC
      await ibAgreement.connect(governor).setCollateralCap(cap);
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('15000'));
    });
  });

  describe('borrow / borrowMax / withdraw / repay / repayFull', () => {
    const collateralAmount = 1 * 1e8; // 1 wBTC
    const collateralPrice = '4000000000000'; // 40000 * 1e8
    const borrowAmount = 100 * 1e6; // 100 USDT
    const borrowPrice = '1000000000000000000000000000000'; // 1e30

    beforeEach(async () => {
      await Promise.all([
        collateral.mint(ibAgreement.address, collateralAmount),
        registry.setPrice(collateral.address, usdAddress, collateralPrice),
        ibAgreement.connect(governor).setPriceFeed(priceFeed.address),
        priceOracle.setUnderlyingPrice(iToken.address, borrowPrice)
      ]);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('20000')); // CF: 50%
    });

    it('borrows successfully', async () => {
      await ibAgreement.connect(borrower).borrow(iToken.address, borrowAmount);
      expect(await ibAgreement.debtUSD()).to.eq(toWei('100'));
    });

    it('failed to borrow for non-borrower', async () => {
      await expect(ibAgreement.borrow(iToken.address, borrowAmount)).to.be.revertedWith('caller is not the borrower');
      expect(await ibAgreement.debtUSD()).to.eq(0);
    });

    it('failed to borrow for undercollateralized', async () => {
      const amount = 20001 * 1e6; // collateral is $20000
      await expect(ibAgreement.connect(borrower).borrow(iToken.address, amount)).to.be.revertedWith('undercollateralized');
      expect(await ibAgreement.debtUSD()).to.eq(0);
    });

    it('failed to borrow for undercollateralized (collateral cap)', async () => {
      const cap = 0.5 * 1e8; // 0.5 wBTC
      await ibAgreement.connect(governor).setCollateralCap(cap);

      const amount = 10001 * 1e6; // collateral is $10000
      await expect(ibAgreement.connect(borrower).borrow(iToken.address, amount)).to.be.revertedWith('undercollateralized');
      expect(await ibAgreement.debtUSD()).to.eq(0);
    });

    it('failed to borrow for unknown reason', async () => {
      await iToken.setBorrowFailed(true);
      await expect(ibAgreement.connect(borrower).borrow(iToken.address, borrowAmount)).to.be.revertedWith('borrow failed');
      expect(await ibAgreement.debtUSD()).to.eq(0);
    });

    it('borrows max successfully', async () => {
      await ibAgreement.connect(borrower).borrowMax(iToken.address);
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000'));
    });

    it('borrows max successfully (collateral cap)', async () => {
      const cap = 0.5 * 1e8; // 0.5 wBTC
      await ibAgreement.connect(governor).setCollateralCap(cap);

      await ibAgreement.connect(borrower).borrowMax(iToken.address);
      expect(await ibAgreement.debtUSD()).to.eq(toWei('10000'));
    });

    it('borrows max successfully (rounding test)', async () => {
      const newCollateralPrice = '3999999999999'; // 39999.9 * 1e8
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);

      await ibAgreement.connect(borrower).borrowMax(iToken.address);
      expect(await ibAgreement.debtUSD()).to.gt(toWei('19999'));
      expect(await ibAgreement.debtUSD()).to.lt(await ibAgreement.collateralUSD());
    });

    it('failed to borrow max for non-borrower', async () => {
      await expect(ibAgreement.borrowMax(iToken.address)).to.be.revertedWith('caller is not the borrower');
      expect(await ibAgreement.debtUSD()).to.eq(0);
    });

    it('failed to borrow max for undercollateralized', async () => {
      await ibAgreement.connect(borrower).borrowMax(iToken.address);
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000'));

      const newCollateralPrice = '3999999999999'; // 39999.9 * 1e8
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);

      await expect(ibAgreement.connect(borrower).borrowMax(iToken.address)).to.be.revertedWith('undercollateralized');
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000'));
    });

    it('repays successfully', async () => {
      await ibAgreement.connect(borrower).borrow(iToken.address, borrowAmount);
      expect(await ibAgreement.debtUSD()).to.eq(toWei('100'));

      await underlying.connect(borrower).approve(ibAgreement.address, borrowAmount);
      await ibAgreement.connect(borrower).repay(iToken.address, borrowAmount);
      expect(await ibAgreement.debtUSD()).to.eq(0);
    });

    it('repays full successfully', async () => {
      await ibAgreement.connect(borrower).borrow(iToken.address, borrowAmount);
      expect(await ibAgreement.debtUSD()).to.eq(toWei('100'));

      await underlying.connect(borrower).approve(ibAgreement.address, borrowAmount);
      await ibAgreement.connect(borrower).repayFull(iToken.address);
      expect(await ibAgreement.debtUSD()).to.eq(0);
    });

    it('failed to repay for non-borrower', async () => {
      await expect(ibAgreement.repay(iToken.address, borrowAmount)).to.be.revertedWith('caller is not the borrower');
    });

    it('failed to repay full for non-borrower', async () => {
      await expect(ibAgreement.repayFull(iToken.address)).to.be.revertedWith('caller is not the borrower');
    });

    it('failed to repay for unknown reason', async () => {
      await ibAgreement.connect(borrower).borrow(iToken.address, borrowAmount);
      expect(await ibAgreement.debtUSD()).to.eq(toWei('100'));

      await underlying.connect(borrower).approve(ibAgreement.address, borrowAmount);
      await iToken.setRepayFailed(true);
      await expect(ibAgreement.connect(borrower).repay(iToken.address, borrowAmount)).to.be.revertedWith('repay failed');
      expect(await ibAgreement.debtUSD()).to.eq(toWei('100'));
    });

    it('withdraws successfully', async () => {
      await ibAgreement.connect(borrower).withdraw(collateralAmount);
      expect(await ibAgreement.collateralUSD()).to.eq(0);
    });

    it('withdraws successfully (collateral cap)', async () => {
      const cap = 0.5 * 1e8; // 0.5 wBTC
      await ibAgreement.connect(governor).setCollateralCap(cap);

      const withdrawAmount = 0.3 * 1e8; // 0.3 wBTC
      await ibAgreement.connect(borrower).withdraw(withdrawAmount);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('10000')); // 0.5 wBTC, CF: 50%
      expect(await collateral.balanceOf(ibAgreement.address)).to.eq(0.7 * 1e8); // 0.7 wBTC remain, only 0.5 wBTC is collateral

      await ibAgreement.connect(borrower).withdraw(withdrawAmount);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('8000')); // 0.4 wBTC, CF: 50%
      expect(await collateral.balanceOf(ibAgreement.address)).to.eq(0.4 * 1e8); // 0.4 wBTC remain, 0.4 wBTC is collateral
    });

    it('failed to withdraw for non-borrower', async () => {
      await expect(ibAgreement.withdraw(collateralAmount)).to.be.revertedWith('caller is not the borrower');
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('20000')); // CF: 50%
    });

    it('failed to withdraw for undercollateralized', async () => {
      await ibAgreement.connect(borrower).borrow(iToken.address, borrowAmount);
      await expect(ibAgreement.connect(borrower).withdraw(collateralAmount)).to.be.revertedWith('undercollateralized');
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('20000')); // CF: 50%
    });
  });

  describe('seize', async () => {
    const collateralAmount = 1 * 1e8; // 1 wBTC
    const amount = toWei('1'); // 1 TOKEN

    beforeEach(async () => {
      await Promise.all([
        collateral.mint(ibAgreement.address, collateralAmount),
        token.mint(ibAgreement.address, amount)
      ]);
    });

    it('seizes successfully', async () => {
      await ibAgreement.connect(executor).seize(token.address, amount);
      expect(await token.balanceOf(executorAddress)).to.eq(amount);
    });

    it('failed to seize for non-executor', async () => {
      await expect(ibAgreement.seize(token.address, amount)).to.be.revertedWith('caller is not the executor');
      expect(await token.balanceOf(executorAddress)).to.eq(0);
    });

    it('failed to seize collateral', async () => {
      await expect(ibAgreement.connect(executor).seize(collateral.address, amount)).to.be.revertedWith('seize collateral not allow');
    });
  });

  describe('liquidateWithExactCollateralAmount / liquidateForExactRepayAmount', async () => {
    const collateralAmount = 1 * 1e8; // 1 wBTC
    const collateralPrice = '4000000000000'; // 40000 * 1e8
    const borrowAmount = 20000 * 1e6; // 20000 USDT
    const borrowPrice = '1000000000000000000000000000000'; // 1e30

    beforeEach(async () => {
      await Promise.all([
        collateral.mint(ibAgreement.address, collateralAmount),
        registry.setPrice(collateral.address, usdAddress, collateralPrice),
        ibAgreement.connect(governor).setPriceFeed(priceFeed.address),
        priceOracle.setUnderlyingPrice(iToken.address, borrowPrice)
      ]);
      await ibAgreement.connect(borrower).borrow(iToken.address, borrowAmount);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('20000')); // CF: 50%
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('30000')); // LF: 75%
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000'));
    });

    it('liquidates with exact collateral amount successfully', async () => {
      const newCollateralPrice = '2666600000000'; // 26666 * 1e8
      const newNormalizedCollateralPrice = '26666'; // for converter
      const collateralAmount = 0.5 * 1e8; // 0.5 wBTC
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);
      await converter.setPrice(newNormalizedCollateralPrice);
      await ibAgreement.connect(executor).setConverter([iToken.address], [converter.address]);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13333')); // $26666, CF: 50%, $13333
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19999.5')); // $26666, LF: 75%, $19999.5
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000')); // $20000 > $19999.5, liquidatable

      await ibAgreement.connect(executor).liquidateWithExactCollateralAmount(iToken.address, collateralAmount, 0);

      expect(await ibAgreement.collateralUSD()).to.eq(toWei('6666.5')); // 0.5 wBTC remain, $13333, CF: 50%, $6666.5
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('9999.75')); // 0.5 wBTC remain, $13333, LF: 75%, $9999.75
      expect(await ibAgreement.debtUSD()).to.eq(toWei('6667')); // 0.5 wBTC liquidated, $13333, $20000 - $13333 = $6667 debt remain, $6667 < $9999.75, not liquidatable
    });

    it('liquidates with exact collateral amount successfully (collateral cap)', async () => {
      const cap = 0.8 * 1e8; // 0.8 wBTC
      await ibAgreement.connect(governor).setCollateralCap(cap);

      const newCollateralPrice = '3300000000000'; // 33000 * 1e8
      const newNormalizedCollateralPrice = '33000'; // for converter
      const collateralAmount = 0.4 * 1e8; // 0.4 wBTC
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);
      await converter.setPrice(newNormalizedCollateralPrice);
      await ibAgreement.connect(executor).setConverter([iToken.address], [converter.address]);
      expect(await collateral.balanceOf(ibAgreement.address)).to.eq(1 * 1e8); // 1 wBTC, only 0.8 wBTC is collateral
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13200')); // 0.8 wBTC * $33000, $26400, CF: 50%, $13200
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19800')); // 0.8 wBTC * $33000, $26400, LF: 75%, $19800
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000')); // $20000 > $19800, liquidatable

      await ibAgreement.connect(executor).liquidateWithExactCollateralAmount(iToken.address, collateralAmount, 0);

      expect(await collateral.balanceOf(ibAgreement.address)).to.eq(0.6 * 1e8); // 0.6 wBTC remain, 0.6 wBTC is collateral
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('9900')); // 0.6 wBTC remain, $19800, CF: 50%, $9900
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('14850')); // 0.6 wBTC remain, $19800, LF: 75%, $14850
      expect(await ibAgreement.debtUSD()).to.eq(toWei('6800')); // 0.4 wBTC liquidated, $13200, $20000 - $13200 = $6800 debt remain, $6800 < $14850, not liquidatable
    });

    it('liquidates for exact repay amount successfully', async () => {
      const newCollateralPrice = '2666600000000'; // 26666 * 1e8
      const newNormalizedCollateralPrice = '26666'; // for converter
      const repayAmount = 5000 * 1e6; // 5000 USDT
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);
      await converter.setPrice(newNormalizedCollateralPrice);
      await ibAgreement.connect(executor).setConverter([iToken.address], [converter.address]);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13333')); // $26666, CF: 50%, $13333
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19999.5')); // $26666, LF: 75%, $19999.5
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000')); // $20000 > $19999.5, liquidatable

      await ibAgreement.connect(executor).liquidateForExactRepayAmount(iToken.address, repayAmount, collateralAmount);

      expect(await ibAgreement.collateralUSD()).to.eq(toWei('10833.00010156')); // $5000 ~= 0.1875 * $26666, ~0.8125 wBTC remain, ~$21666, CF: 50%, ~$10833
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('16249.50015234')); // $5000 ~= 0.1875 * $26666, ~0.8125 wBTC remain, ~$21666, LF: 75%, ~$16249
      expect(await ibAgreement.debtUSD()).to.eq(toWei('15000')); // ~0.1875 wBTC liquidated, $5000, $20000 - $5000 = $15000 debt remain, $15000 < $16249, not liquidatable
    });

    it('liquidates for exact repay amount successfully (collateral cap)', async () => {
      const cap = 0.8 * 1e8; // 0.8 wBTC
      await ibAgreement.connect(governor).setCollateralCap(cap);

      const newCollateralPrice = '3300000000000'; // 33000 * 1e8
      const newNormalizedCollateralPrice = '33000'; // for converter
      const repayAmount = 5000 * 1e6; // 5000 USDT
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);
      await converter.setPrice(newNormalizedCollateralPrice);
      await ibAgreement.connect(executor).setConverter([iToken.address], [converter.address]);
      expect(await collateral.balanceOf(ibAgreement.address)).to.eq(1 * 1e8); // 1 wBTC, only 0.8 wBTC is collateral
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13200')); // 0.8 wBTC * $33000, $26400, CF: 50%, $13200
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19800')); // 0.8 wBTC * $33000, $26400, LF: 75%, $19800
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000')); // $20000 > $19800, liquidatable

      await ibAgreement.connect(executor).liquidateForExactRepayAmount(iToken.address, repayAmount, collateralAmount);

      expect(await collateral.balanceOf(ibAgreement.address)).to.eq(0.84848485 * 1e8); // ~0.8484 wBTC remain, only 0.8 wBTC is collateral
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13200')); // $5000 ~= 0.1516 * $33000, ~0.8484 wBTC remain, only 0.8 wBTC is collateral, ~$26400, CF: 50%, ~$13200
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19800')); // $5000 ~= 0.1516 * $33000, ~0.8484 wBTC remain, only 0.8 wBTC is collateral, ~$26400, LF: 75%, ~$19800
      expect(await ibAgreement.debtUSD()).to.eq(toWei('15000')); // ~0.1516 wBTC liquidated, $5000, $20000 - $5000 = $15000 debt remain, $15000 < $19800, not liquidatable
    });

    it('failed to liquidate for non-executor', async () => {
      const amount = 0.5 * 1e8; // 0.5 wBTC
      await expect(ibAgreement.liquidateWithExactCollateralAmount(iToken.address, amount, 0)).to.be.revertedWith('caller is not the executor');
    });

    it('failed to liquidate for not liquidatable', async () => {
      const amount = 0.5 * 1e8; // 0.5 wBTC
      await expect(ibAgreement.connect(executor).liquidateWithExactCollateralAmount(iToken.address, amount, 0)).to.be.revertedWith('not liquidatable');
    });

    it('failed to liquidate for empty converter', async () => {
      const newCollateralPrice = '2666600000000'; // 26666 * 1e8
      const amount = 0.5 * 1e8; // 0.5 wBTC
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13333')); // $26666, CF: 50%, $13333
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19999.5')); // $26666, LF: 75%, $19999.5
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000')); // $20000 > $19999.5, liquidatable

      await expect(ibAgreement.connect(executor).liquidateWithExactCollateralAmount(iToken.address, amount, 0)).to.be.revertedWith('empty converter');
    });

    it('failed to liquidate for exact repay amount for too much collateral needed', async () => {
      const newCollateralPrice = '2666600000000'; // 26666 * 1e8
      const newNormalizedCollateralPrice = '26666'; // for converter
      const repayAmount = 5000 * 1e6; // 5000 USDT
      const maxCollateralAmount = 0.1 * 1e8; // 0.1 wBTC
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);
      await converter.setPrice(newNormalizedCollateralPrice);
      await ibAgreement.connect(executor).setConverter([iToken.address], [converter.address]);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13333')); // $26666, CF: 50%, $13333
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19999.5')); // $26666, LF: 75%, $19999.5
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000')); // $20000 > $19999.5, liquidatable

      await expect(ibAgreement.connect(executor).liquidateForExactRepayAmount(iToken.address, repayAmount, maxCollateralAmount)).to.be.revertedWith('too much collateral needed');
    });

    it('failed to liquidate with exact collateral amount for liquidate too much', async () => {
      const newCollateralPrice = '2666600000000'; // 26666 * 1e8
      const newNormalizedCollateralPrice = '26666'; // for converter
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);
      await converter.setPrice(newNormalizedCollateralPrice);
      await ibAgreement.connect(executor).setConverter([iToken.address], [converter.address]);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13333')); // $26666, CF: 50%, $13333
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19999.5')); // $26666, LF: 75%, $19999.5
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000')); // $20000 > $19999.5, liquidatable

      let amount = 0.51 * 1e8; // 0.51 wBTC
      await expect(ibAgreement.connect(executor).liquidateWithExactCollateralAmount(iToken.address, amount, 0)).to.be.revertedWith('liquidate too much');

      amount = 0.5 * 1e8; // 0.5 wBTC
      await ibAgreement.connect(executor).liquidateWithExactCollateralAmount(iToken.address, amount, 0);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('6666.5')); // 0.5 wBTC remain, $13333, CF: 50%, $6666.5
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('9999.75')); // 0.5 wBTC remain, $13333, LF: 75%, $9999.75
      expect(await ibAgreement.debtUSD()).to.eq(toWei('6667')); // 0.5 wBTC liquidated, $13333, $20000 - $13333 = $6667 debt remain, $6667 < $9999.75, not liquidatable
    });

    it('failed to liquidate with exact collateral amount for liquidate too much (collateral cap)', async () => {
      const cap = 0.8 * 1e8; // 0.8 wBTC
      await ibAgreement.connect(governor).setCollateralCap(cap);

      const newCollateralPrice = '3300000000000'; // 33000 * 1e8
      const newNormalizedCollateralPrice = '33000'; // for converter
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);
      await converter.setPrice(newNormalizedCollateralPrice);
      await ibAgreement.connect(executor).setConverter([iToken.address], [converter.address]);
      expect(await collateral.balanceOf(ibAgreement.address)).to.eq(1 * 1e8); // 1 wBTC, only 0.8 wBTC is collateral
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13200')); // 0.8 wBTC * $33000, $26400, CF: 50%, $13200
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19800')); // 0.8 wBTC * $33000, $26400, LF: 75%, $19800
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000')); // $20000 > $19800, liquidatable

      let amount = 0.41 * 1e8; // 0.41 wBTC
      await expect(ibAgreement.connect(executor).liquidateWithExactCollateralAmount(iToken.address, amount, 0)).to.be.revertedWith('liquidate too much');

      amount = 0.4 * 1e8; // 0.4 wBTC
      await ibAgreement.connect(executor).liquidateWithExactCollateralAmount(iToken.address, amount, 0);
      expect(await collateral.balanceOf(ibAgreement.address)).to.eq(0.6 * 1e8); // 0.6 wBTC remain, 0.6 wBTC is collateral
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('9900')); // 0.6 wBTC remain, $19800, CF: 50%, $9900
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('14850')); // 0.6 wBTC remain, $19800, LF: 75%, $14850
      expect(await ibAgreement.debtUSD()).to.eq(toWei('6800')); // 0.4 wBTC liquidated, $13200, $20000 - $13200 = $6800 debt remain, $6800 < $14850, not liquidatable
    });

    it('failed to liquidate for exact repay amount for liquidate too much', async () => {
      const newCollateralPrice = '2666600000000'; // 26666 * 1e8
      const newNormalizedCollateralPrice = '26666'; // for converter
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);
      await converter.setPrice(newNormalizedCollateralPrice);
      await ibAgreement.connect(executor).setConverter([iToken.address], [converter.address]);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13333')); // $26666, CF: 50%, $13333
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19999.5')); // $26666, LF: 75%, $19999.5
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000')); // $20000 > $19999.5, liquidatable

      let repayAmount = 13334 * 1e6; // 13334 USDT
      await expect(ibAgreement.connect(executor).liquidateForExactRepayAmount(iToken.address, repayAmount, collateralAmount)).to.be.revertedWith('liquidate too much');

      repayAmount = 13333 * 1e6; // 13333 USDT
      await ibAgreement.connect(executor).liquidateForExactRepayAmount(iToken.address, repayAmount, collateralAmount);
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('6666.5')); // 0.5 wBTC remain, $13333, CF: 50%, $6666.5
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('9999.75')); // 0.5 wBTC remain, $13333, LF: 75%, $9999.75
      expect(await ibAgreement.debtUSD()).to.eq(toWei('6667')); // 0.5 wBTC liquidated, $13333, $20000 - $13333 = $6667 debt remain, $6667 < $9999.75, not liquidatable
    });

    it('failed to liquidate for exact repay amount for liquidate too much (collateral cap)', async () => {
      const cap = 0.8 * 1e8; // 0.8 wBTC
      await ibAgreement.connect(governor).setCollateralCap(cap);

      const newCollateralPrice = '3300000000000'; // 33000 * 1e8
      const newNormalizedCollateralPrice = '33000'; // for converter
      await registry.setPrice(collateral.address, usdAddress, newCollateralPrice);
      await converter.setPrice(newNormalizedCollateralPrice);
      await ibAgreement.connect(executor).setConverter([iToken.address], [converter.address]);
      expect(await collateral.balanceOf(ibAgreement.address)).to.eq(1 * 1e8); // 1 wBTC, only 0.8 wBTC is collateral
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('13200')); // 0.8 wBTC * $33000, $26400, CF: 50%, $13200
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('19800')); // 0.8 wBTC * $33000, $26400, LF: 75%, $19800
      expect(await ibAgreement.debtUSD()).to.eq(toWei('20000')); // $20000 > $19800, liquidatable

      let repayAmount = 13201 * 1e6; // 13201 USDT
      await expect(ibAgreement.connect(executor).liquidateForExactRepayAmount(iToken.address, repayAmount, collateralAmount)).to.be.revertedWith('liquidate too much');

      repayAmount = 13200 * 1e6; // 13200 USDT
      await ibAgreement.connect(executor).liquidateForExactRepayAmount(iToken.address, repayAmount, collateralAmount);
      expect(await collateral.balanceOf(ibAgreement.address)).to.eq(0.6 * 1e8); // 0.6 wBTC remain, 0.6 wBTC is collateral
      expect(await ibAgreement.collateralUSD()).to.eq(toWei('9900')); // 0.6 wBTC remain, $19800, CF: 50%, $9900
      expect(await ibAgreement.liquidationThreshold()).to.eq(toWei('14850')); // 0.6 wBTC remain, $19800, LF: 75%, $14850
      expect(await ibAgreement.debtUSD()).to.eq(toWei('6800')); // 0.4 wBTC liquidated, $13200, $20000 - $13200 = $6800 debt remain, $6800 < $14850, not liquidatable
    });
  });

  describe('setConverter', async () => {
    it('sets converters successfully', async () => {
      await ibAgreement.connect(executor).setConverter([iToken.address, iToken2.address], [converter.address, converter2.address]);
      expect(await ibAgreement.converters(iToken.address)).to.eq(converter.address);
      expect(await ibAgreement.converters(iToken2.address)).to.eq(converter2.address);
    });

    it('failed to set converters for non-executor', async () => {
      await expect(ibAgreement.setConverter([iToken.address, iToken2.address], [converter.address, converter2.address])).to.be.revertedWith('caller is not the executor');
    });

    it('failed to set converters for length mismatch', async () => {
      await expect(ibAgreement.connect(executor).setConverter([iToken.address, iToken2.address], [converter.address])).to.be.revertedWith('length mismatch');
    });

    it('failed to set converters for empty converter', async () => {
      await expect(ibAgreement.connect(executor).setConverter([iToken.address, iToken2.address], [converter.address, ethers.constants.AddressZero])).to.be.revertedWith('empty converter');
    });

    it('failed to set converters for mismatch source token', async () => {
      await expect(ibAgreement.connect(executor).setConverter([iToken.address, iToken2.address], [converter.address, invalidConverter.address])).to.be.revertedWith('mismatch source token');
    });

    it('failed to set converters for mismatch destination token', async () => {
      await expect(ibAgreement.connect(executor).setConverter([iToken.address, iToken2.address], [converter.address, converter.address])).to.be.revertedWith('mismatch destination token');
    });
  });

  describe('setPriceFeed', async () => {
    it('sets price feed successfully', async () => {
      await ibAgreement.connect(governor).setPriceFeed(priceFeed.address);
      expect(await ibAgreement.priceFeed()).to.eq(priceFeed.address);
    });

    it('failed to set price feed for non-governor', async () => {
      await expect(ibAgreement.setPriceFeed(priceFeed.address)).to.be.revertedWith('caller is not the governor');
    });
  });

  describe('setCollateralCap', async () => {
    const newCap = 2 * 1e8;

    it('sets collateral cap successfully', async () => {
      await ibAgreement.connect(governor).setCollateralCap(newCap);
      expect(await ibAgreement.collateralCap()).to.eq(newCap);
    });

    it('failed to set collateral cap for non-governor', async () => {
      await expect(ibAgreement.setCollateralCap(newCap)).to.be.revertedWith('caller is not the governor');
    });
  });
});
