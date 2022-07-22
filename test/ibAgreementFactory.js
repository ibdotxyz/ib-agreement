const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBAgreementFactory", () => {
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

  let ibAgreementFactory;
  let underlying;
  let underlying2;
  let iToken;
  let iToken2;
  let priceOracle;
  let comptroller;
  let collateral;
  let registry;
  let priceFeed;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    executor = accounts[1];
    executorAddress = await executor.getAddress();
    borrower = accounts[2];
    borrowerAddress = await borrower.getAddress();
    governor = accounts[3];
    governorAddress = await governor.getAddress();

    const ibAgreementFactoryFactory = await ethers.getContractFactory("IBAgreementFactory");
    const tokenFactory = await ethers.getContractFactory("MockToken");
    const iTokenFactory = await ethers.getContractFactory("MockIToken");
    const priceOracleFactory = await ethers.getContractFactory("MockPriceOralce");
    const comptrollerFactory = await ethers.getContractFactory("MockComptroller");
    const registryFactory = await ethers.getContractFactory("MockRegistry");
    const priceFeedFactory = await ethers.getContractFactory("ChainlinkPriceFeedRegistry");

    priceOracle = await priceOracleFactory.deploy();
    comptroller = await comptrollerFactory.deploy(priceOracle.address);
    underlying = await tokenFactory.deploy("USD Tether", "USDT", 6);
    underlying2 = await tokenFactory.deploy("Wrapped Ether", "WETH", 18);
    iToken = await iTokenFactory.deploy(comptroller.address, underlying.address);
    iToken2 = await iTokenFactory.deploy(comptroller.address, underlying2.address);
    collateral = await tokenFactory.deploy("Wrapped BTC", "WBTC", 8);
    registry = await registryFactory.deploy();
    priceFeed = await priceFeedFactory.deploy(registry.address, collateral.address, collateral.address, usdAddress);
    ibAgreementFactory = await ibAgreementFactoryFactory.deploy(comptroller.address);
  });

  it('creates ibAgreement', async () => {
    await ibAgreementFactory.create(executorAddress, borrowerAddress, governorAddress, collateral.address, priceFeed.address, collateralFactor, liquidationFactor, closeFactor, collateralCap);

    expect(await ibAgreementFactory.count()).to.eq(1);
  });
});
