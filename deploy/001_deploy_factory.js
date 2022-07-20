const { ethers } = require('hardhat');

module.exports = async({
  getNamedAccounts,
  deployments,
}) => {
  const {deploy} = deployments;
  const {deployer, admin, comptroller} = await getNamedAccounts();

  await deploy('IBAgreementFactory', {
    from: deployer,
    args: [comptroller],
    log: true
  });
};

module.exports.tags = ['Factory'];
