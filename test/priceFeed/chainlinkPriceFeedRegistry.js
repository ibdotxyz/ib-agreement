const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ChainlinkPriceFeedRegistry", () => {
  const toWei = ethers.utils.parseEther;
  const usdAddress = '0x0000000000000000000000000000000000000348';
  const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  let accounts;
  let user, userAddress;

  let tokenFactory;
  let registryFactory;
  let priceFeedFactory;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    user = accounts[0];
    userAddress = await user.getAddress();

    tokenFactory = await ethers.getContractFactory("MockToken");
    registryFactory = await ethers.getContractFactory("MockRegistry");
    priceFeedFactory = await ethers.getContractFactory("ChainlinkPriceFeedRegistry");
  });

  it('get price (USD quote)', async () => {
    const price = '4000000000000'; // 40000 * 1e8

    const token = await tokenFactory.deploy("Wrapped BTC", "WBTC", 8);
    const registry = await registryFactory.deploy();
    const priceFeed = await priceFeedFactory.deploy(registry.address, token.address, token.address, usdAddress);
    await registry.setPrice(token.address, usdAddress, price);

    expect(await priceFeed.getToken()).to.eq(token.address);
    expect(await priceFeed.getPrice()).to.eq(toWei('40000'));
  });

  it('get price (ETH quote)', async () => {
    const ethPrice = '300000000000'; // 3000 * 1e8
    const price = '6000000'; // 1 Cream = 0.06 ETH, 0.06 * 1e8

    const token = await tokenFactory.deploy("Cream", "CREAM", 18);
    const registry = await registryFactory.deploy();
    const priceFeed = await priceFeedFactory.deploy(registry.address, token.address, token.address, ethAddress);
    await registry.setPrice(ethAddress, usdAddress, ethPrice);
    await registry.setPrice(token.address, ethAddress, price);

    expect(await priceFeed.getToken()).to.eq(token.address);
    expect(await priceFeed.getPrice()).to.eq(toWei('180'));
  });
});
