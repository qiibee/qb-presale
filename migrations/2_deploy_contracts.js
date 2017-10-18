const QiibeeCrowdsale = artifacts.require("./QiibeeCrowdsale.sol");

module.exports = function(deployer) {
  const startTime = web3.eth.getBlock('latest').timestamp // blockchain block number (in timestamp) where the crowdsale will commence.
  const endTime = startTime + (86400 * 20)  // blockchain block number (in timestamp) where it will end.
  const rate = new web3.BigNumber(3000) // rate of ether to Qiibee Coin in wei: 3000 qbx are 1 wei
  const goal = new web3.BigNumber(10000) // minimum amount of qbx to be sold
  const cap = new web3.BigNumber(10000000000) // max amount of tokens (in atto) to be sold
  const minInvest = new web3.BigNumber(1) // max amount of tokens (in atto) to be sold
  const maxInvest = new web3.BigNumber(10000000000) // max amount of tokens (in atto) to be sold
  const maxGasPrice = new web3.BigNumber(50000000000) // max amount og gas allowed per transaction
  const maxCallFrequency = new web3.BigNumber(600) // frequency between one call and the next one for an address (in seconds)
  const wallet = web3.eth.accounts[0] // the address that will hold the fund. Recommended to use a multisig one for security.

  // deployer.deploy(QiibeeCrowdsale, startTime, endTime, rate, goal, cap, minInvest, maxInvest, maxGasPrice, maxCallFrequency, wallet);
};
