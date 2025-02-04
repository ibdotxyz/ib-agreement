const { ethers } = require('hardhat');

module.exports = async({
  getNamedAccounts,
  deployments,
}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  const uniswapV3Router = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
  const uniswapV3Quoter = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6'

  const PERP = '0x9e1028F5F1D5eDE59748FFceE5532509976840E0'
  const WETH = '0x4200000000000000000000000000000000000006'
  const USDC = '0x7F5c764cBc14f9669B88837ca1490cCa17c31607'
  const paths = [PERP, WETH, USDC]
  const fees = [3000, 500]

  const collateralSymbol = 'PERP'
  const collateralToken = PERP
  const priceAggregator = '0xA12CDDd8e986AF9288ab31E58C60e65F2987fB13'

  await deploy(`${collateralSymbol}PriceFeed`, {
    from: deployer,
    contract: 'ChainlinkPriceFeedAggregator',
    args: [
      priceAggregator,
      collateralToken
    ],
    log: true
  })

  await deploy(`${collateralSymbol}Converter`, {
    from: deployer,
    contract: 'UniswapV3Converter',
    args: [uniswapV3Router, uniswapV3Quoter, paths, fees],
    log: true
  });

  // await deploy(`Simple${collateralSymbol}PriceFeed`, {
  //   from: deployer,
  //   contract: 'SimplePriceFeed',
  //   args: [collateralToken],
  //   log: true
  // });
};

module.exports.tags = ['oracle', 'converter'];
