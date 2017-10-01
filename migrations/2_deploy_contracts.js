const QiibeeCrowdsale = artifacts.require("./QiibeeCrowdsale.sol");

module.exports = function(deployer) {
  const startBlock = web3.eth.blockNumber + 2 // blockchain block number where the crowdsale will commence. Here I just taking the current block that the contract and setting that the crowdsale starts two block after
  const endBlock = startBlock + 300  // blockchain block number where it will end. 300 is little over an hour.
  const initialRate = new web3.BigNumber(3000) // rate of ether to Qiibee Coin in wei: 3000 qbx are 1 wei
  const endRate = new web3.BigNumber(5000) // rate of ether to Qiibee Coin in wei
  const preferentialRate = new web3.BigNumber(1000) // rate of ether to Qiibee Coin in wei
  const goal = new web3.BigNumber(10000) // minimum amount of qbx to be sold
  const cap = new web3.BigNumber(10000000000) // max amount of tokens to be sold
  const wallet = web3.eth.accounts[0] // the address that will hold the fund. Recommended to use a multisig one for security.

  // deployer.deploy(QiibeeCrowdsale, startBlock, endBlock, initialRate, endRate, preferentialRate, goal, cap, wallet);
};
