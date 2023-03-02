const { ethers } = require('hardhat');

module.exports = async({
  getNamedAccounts,
  deployments,
}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  const sushiRouter = '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'
  const ICE = '0xf16e81dce15B08F326220742020379B855B87DF9'
  const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'

  await deploy(`EasyConverter`, {
    from: deployer,
    contract: 'EasyConverter',
    args: [sushiRouter, WETH, ICE, USDT],
    log: true
  });
};

module.exports.tags = ['easy-converter'];
