const path = require('path');
const address = require(path.resolve( __dirname, "../private.js" )).ADDRESS;

const QiibeeCrowdsale = artifacts.require("./QiibeeCrowdsale.sol");
const QiibeePresale = artifacts.require("./QiibeePresale.sol");
const QiibeeToken = artifacts.require("./QiibeeToken.sol");
const MigrationAgent = artifacts.require("./MigrationAgent.sol");
// const MyContract = artifacts.require("./MyContract.sol");
// const QiibeeMigrationToken = artifacts.require("./QiibeeMigrationToken.sol");

module.exports = function(deployer) {
  let startTimePresale, startTimeCrowdsale; // blockchain block number (in timestamp) where the crowdsale will commence.
  let endTimePresale, endTimeCrowdsale;  // blockchain block number (in timestamp) where it will end.
  let wallet; // the address that will hold the fund. Recommended to use a multisig one for security.

  const rate = new web3.BigNumber(3000) // rate of ether to Qiibee Coin in ether: 3000 qbx are 1 ether
  const goal = new web3.BigNumber(2000000000000000000) // minimum amount of qbx to be sold 1500 qbx
  const cap = new web3.BigNumber(8000000000000000000) // max amount of tokens (in atto) to be sold 10bn 6000qbx
  const distributionCap = new web3.BigNumber(8000000000000000000) // max amount of tokens (in atto) to be sold 10bn 6000qbx
  const minInvest = new web3.BigNumber(1000000000000000000) // max amount of tokens (in atto) to be sold 400qbx
  const maxCumulativeInvest = new web3.BigNumber(3000000000000000000) // max amount of tokens (in atto) to be sold 4000qbx
  const maxGasPrice = new web3.BigNumber(5000000000000000000) // max amount og gas allowed per transaction 50 gwei
  const minBuyingRequestInterval = new web3.BigNumber(60) // frequency between one call and the next one for an address (in seconds)
  const presalecap = new web3.BigNumber(8000000000000000000) // max amount of tokens to be sold

  if (process.argv.toString().indexOf('ropsten') !== -1) {
    startTimePresale = 1511085894 + 500;
    endTimePresale = startTimePresale + 3600; //1 hour

    startTimeCrowdsale = 1511085894 + 1500; //10 min
    endTimeCrowdsale = startTimeCrowdsale + 3600; //1 hour

    wallet = '';
    console.log('Using ropsten network. Wallet address: ', wallet);
  } else {
    startTimePresale = web3.eth.getBlock('latest').timestamp + 60;
    endTimePresale = startTimePresale + 864000; //10 days

    startTimeCrowdsale = endTimePresale + 432000; //5days
    endTimeCrowdsale = startTimeCrowdsale + 864000; //10 days

    wallet = web3.eth.accounts[0];
    console.log('Using testrpc network. Wallet address: ', wallet);
  }

  // deployer.deploy(QiibeeToken, web3.eth.accounts[9]).then(function(hola){
  //   QiibeeToken.deployed().then(function(token){
  //     deployer.deploy(MigrationAgent, token.address);
  //   })
  // });
  // deployer.deploy(QiibeePresale, startTimePresale, endTimePresale, rate, presalecap, distributionCap, maxGasPrice, minBuyingRequestInterval, wallet);
  // deployer.deploy(QiibeeCrowdsale, startTimeCrowdsale, endTimeCrowdsale, rate, goal, cap, minInvest, maxCumulativeInvest, maxGasPrice, minBuyingRequestInterval, wallet);
};
