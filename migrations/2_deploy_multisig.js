const path = require('path');
const address = require(path.resolve( __dirname, "../private.js" )).ADDRESS;

const MultiSigWalletWithDailyLimit = artifacts.require("./MultiSigWalletWithDailyLimit.sol");

module.exports = function(deployer) {
  let wallet, wallet1, wallet2;

  if (process.argv.toString().indexOf('ropsten') !== -1) {
    wallet = '0xE4864a92f06705DEFfDDde074E9FF150C25A28EC';
    wallet1 =  '0x0082cA00741b7c76fB8cd52dAeb51B6475473827';
    wallet2 =  '0x0069f9Aef87E6c2Df995696672c3294Fac85FeaD';
  } else {
    wallet = web3.eth.accounts[0],
    wallet1 =  web3.eth.accounts[1],
    wallet2 =  web3.eth.accounts[2];
  }
  deployer.deploy(MultiSigWalletWithDailyLimit, [wallet, wallet1, wallet2], 2, '1000000000000000000'); // 1 eth daily imit
};
