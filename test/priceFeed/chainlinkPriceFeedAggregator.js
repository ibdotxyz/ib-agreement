const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ChainlinkPriceFeedAggregator", () => {
  const toWei = ethers.utils.parseEther;

  let accounts;
  let user, userAddress;

  let tokenFactory;
  let aggregatorFactory;
  let priceFeedFactory;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    user = accounts[0];
    userAddress = await user.getAddress();

    tokenFactory = await ethers.getContractFactory("MockToken");
    aggregatorFactory = await ethers.getContractFactory("MockAggregator");
    priceFeedFactory = await ethers.getContractFactory("ChainlinkPriceFeedAggregator");
  });

  it('get price', async () => {
    const price = '4000000000000'; // 40000 * 1e8

    const token = await tokenFactory.deploy("Wrapped BTC", "WBTC", 8);
    const aggregator = await aggregatorFactory.deploy();
    const priceFeed = await priceFeedFactory.deploy(aggregator.address, token.address);
    await aggregator.setPrice(price);

    expect(await priceFeed.getToken()).to.eq(token.address);
    expect(await priceFeed.getPrice()).to.eq(toWei('40000'));
  });
});
