const { expect } = require("chai");
const { ethers } = require("hardhat");
const { impersonateAccount } = require("./testUtil.js");

describe("Uniswap v3 converter", () => {
  const toWei = ethers.utils.parseEther;
  const perpAddress = '0xbC396689893D065F41bc2C6EcbeE5e0085233447';
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const perpWhaleAddress = '0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1';
  const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const routerAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
  const quoterAddress = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

  let accounts;
  let ibAgreement, ibAgreementAddress;
  let perp, usdc;
  let perpWhale;
  let converter;
  let token;

  const swapAmount = toWei('1000'); // swap 1000 PERP
  const receivedAmount = '1000000000'; // receive 1000 USDC

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    ibAgreement = accounts[0];
    ibAgreementAddress = await ibAgreement.getAddress();
    perpWhale = await impersonateAccount(perpWhaleAddress);
    const tokenFactory = await ethers.getContractFactory("MockToken");
    const converterFactory = await ethers.getContractFactory("UniswapV3Converter");

    perp = tokenFactory.attach(perpAddress);
    usdc = tokenFactory.attach(usdcAddress);

    converter = await converterFactory.deploy(routerAddress, quoterAddress, [perpAddress, wethAddress, usdcAddress], [3000, 500], ibAgreementAddress);
    expect(await converter.source()).to.eq(perpAddress);
    expect(await converter.destination()).to.eq(usdcAddress);

    token = await tokenFactory.deploy("Token", "TOKEN", 18);
  });

  it('convert exact PERP for USDC', async () => {
    // Faucet some PERP.
    await perp.connect(perpWhale).transfer(ibAgreementAddress, swapAmount);

    const initialUSDCBalance = await usdc.balanceOf(ibAgreementAddress);

    // Approve and convert.
    await perp.connect(ibAgreement).approve(converter.address, swapAmount);
    await converter.connect(ibAgreement).convertExactTokensForTokens(swapAmount, 0);

    const postUSDCBalance = await usdc.balanceOf(ibAgreementAddress);
    expect(postUSDCBalance.gt(initialUSDCBalance)).to.be.true;

    // console.log(initialUSDCBalance.toString());
    // console.log(postUSDCBalance.toString());
  });

  it('convert PERP for exact USDC', async () => {
    // Faucet some PERP.
    const amountIn = await converter.callStatic.getAmountIn(receivedAmount);
    await perp.connect(perpWhale).transfer(ibAgreementAddress, amountIn);

    const initialUSDCBalance = await usdc.balanceOf(ibAgreementAddress);

    // Approve and convert.
    await perp.connect(ibAgreement).approve(converter.address, amountIn);
    await converter.connect(ibAgreement).convertTokensForExactTokens(receivedAmount, amountIn);

    const postUSDCBalance = await usdc.balanceOf(ibAgreementAddress);
    expect(postUSDCBalance.gt(initialUSDCBalance)).to.be.true;

    // console.log(initialUSDCBalance.toString());
    // console.log(postUSDCBalance.toString());
  });

  describe('seize', () => {
    const amount = toWei('10');

    beforeEach(async () => {
      await token.mint(converter.address, amount);
    });

    it('seize tokens', async () => {
      await converter.seize(token.address);
      expect(await token.balanceOf(converter.address)).to.eq(0);
    });

    it('fails to seize tokens', async () => {
      await expect(converter.connect(perpWhale).seize(token.address)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
