const { ethers, waffle } = require("hardhat");

const impersonateAccount = async (address) => {
  const signer = await ethers.provider.getSigner(address);
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  return signer;
};

const stopImpersonateAccount = async (address) => {
  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [address],
  });
};

const resetChain = async (blockNumber) => {
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: "https://mainnet-eth.compound.finance/",
          blockNumber: blockNumber,
        },
      },
    ],
  });
};

module.exports = {
  impersonateAccount: impersonateAccount,
  stopImpersonateAccount: stopImpersonateAccount,
  resetChain: resetChain,
};
