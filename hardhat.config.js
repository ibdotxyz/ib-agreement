/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require('hardhat-deploy');
require('dotenv').config();

module.exports = {
  networks: {
    hardhat: {
      forking: {
        // url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
        url: `https://rpc.ankr.com/eth/${process.env.ANKR_API_KEY}`
      },
    },
    op: {
      url: `https://optimism-mainnet.infura.io/v3/${process.env.INFURA_TOKEN}`,
      accounts: process.env.DEPLOY_PRIVATE_KEY == undefined ? [] : [`0x${process.env.DEPLOY_PRIVATE_KEY}`]
    }
  },
  solidity: {
    version: "0.8.2" ,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  namedAccounts: {
    deployer: 0,
    admin: {
      mainnet: '0xA5fC0BbfcD05827ed582869b7254b6f141BA84Eb',
      fantom: '0xA5fC0BbfcD05827ed582869b7254b6f141BA84Eb',
      avalanche: '0xf3472A93B94A17dC20F9Dc9D0D48De42FfbD14f4',
      op: '0xfB9423283EB7F65210B9aB545ecC212B5AE52b3A'
    },
    comptroller: {
      mainnet: '0xAB1c342C7bf5Ec5F02ADEA1c2270670bCa144CbB',
      fantom: '0x4250A6D3BD57455d7C6821eECb6206F507576cD2',
      avalanche: '0x2eE80614Ccbc5e28654324a66A396458Fa5cD7Cc',
      op: '0xE0B57FEEd45e7D908f2d0DaCd26F113Cf26715BF'
    }
  },
  etherscan: {
    apiKey: process.env.OPSCAN_API_KEY == undefined ? '' : process.env.OPSCAN_API_KEY
  }
};
