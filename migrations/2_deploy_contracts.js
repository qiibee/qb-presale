const QiibeeCrowdsale = artifacts.require("./QiibeeCrowdsale.sol");
const QiibeePresale = artifacts.require("./QiibeePresale.sol");

module.exports = function(deployer) {
  const startTime = web3.eth.getBlock('latest').timestamp + 300 // blockchain block number (in timestamp) where the crowdsale will commence.
  // const startTime = 1508930939 + (11 * 60) // blockchain block number (in timestamp) where the crowdsale will commence.
  const endTime = startTime + 3600  // blockchain block number (in timestamp) where it will end.
  const rate = new web3.BigNumber(3000) // rate of ether to Qiibee Coin in ether: 3000 qbx are 1 ether
  const goal = new web3.BigNumber(1500000000000000000000) // minimum amount of qbx to be sold 1500 qbx
  const cap = new web3.BigNumber(6000000000000000000000) // max amount of tokens (in atto) to be sold 10bn 6000qbx
  const minInvest = new web3.BigNumber(400000000000000000000) // max amount of tokens (in atto) to be sold 400qbx
  const maxInvest = new web3.BigNumber(4000000000000000000000) // max amount of tokens (in atto) to be sold 4000qbx
  const maxGasPrice = new web3.BigNumber(50000000000) // max amount og gas allowed per transaction 50 gwei
  const maxCallFrequency = new web3.BigNumber(60) // frequency between one call and the next one for an address (in seconds)
  const presalecap = new web3.BigNumber(10000000000000000000000000000) // max amount of tokens to be sold

  const wallet = web3.eth.accounts[0] // the address that will hold the fund. Recommended to use a multisig one for security.

  // const wallet = "0x9E6C2aD716d6A94f52819aC99acec797FC79015b" // the address that will hold the fund. Recommended to use a multisig one for security.
    console.log(wallet);

  deployer.deploy(QiibeeCrowdsale, startTime, endTime, rate, goal, cap, minInvest, maxInvest, maxGasPrice, maxCallFrequency, wallet);
 // deployer.deploy(QiibeePresale, presalecap, wallet);
};
