const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("UniswapV3PriceFeed", () => {
  const toWei = ethers.utils.parseEther;
  const usdAddress = '0x0000000000000000000000000000000000000348';
  const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  let accounts;
  let user, userAddress;

  let tokenFactory;
  let registryFactory;
  let multipriceOracleFactory;
  let priceFeedFactory;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    user = accounts[0];
    userAddress = await user.getAddress();

    tokenFactory = await ethers.getContractFactory("MockToken");
    registryFactory = await ethers.getContractFactory("MockRegistry");
    multipriceOracleFactory = await ethers.getContractFactory("MockMultiPriceOracle");
    priceFeedFactory = await ethers.getContractFactory("UniswapV3PriceFeed");
  });

  it('get price (ETH quote)', async () => {
    const ethPrice = '300000000000'; // 3000 * 1e8
    const price = toWei('0.0004'); // 1 ICE = 0.0004 ETH

    const token = await tokenFactory.deploy("ICE", "ICE", 18);
    const registry = await registryFactory.deploy();
    const multipriceOracle = await multipriceOracleFactory.deploy();
    const priceFeed = await priceFeedFactory.deploy(registry.address, multipriceOracle.address, token.address);
    await registry.setPrice(ethAddress, usdAddress, ethPrice);
    await multipriceOracle.setPrice(price);

    expect(await priceFeed.getToken()).to.eq(token.address);
    expect(await priceFeed.getPrice()).to.eq(toWei('1.2'));
  });
});
