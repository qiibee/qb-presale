const QiibeeCrowdsale = artifacts.require("./QiibeeCrowdsale.sol");
const QiibeePresale = artifacts.require("./QiibeePresale.sol");
const QiibeeToken = artifacts.require("./QiibeeToken.sol");

module.exports = function(deployer) {
  let startTime; // blockchain block number (in timestamp) where the crowdsale will commence.
  let endTime;  // blockchain block number (in timestamp) where it will end.
  let wallet; // the address that will hold the fund. Recommended to use a multisig one for security.

  const rate = new web3.BigNumber(3000) // rate of ether to Qiibee Coin in ether: 3000 qbx are 1 ether
  const goal = new web3.BigNumber(2000000000000000000) // minimum amount of qbx to be sold 1500 qbx
  const cap = new web3.BigNumber(8000000000000000000) // max amount of tokens (in atto) to be sold 10bn 6000qbx
  const minInvest = new web3.BigNumber(1000000000000000000) // max amount of tokens (in atto) to be sold 400qbx
  const maxCumulativeInvest = new web3.BigNumber(3000000000000000000) // max amount of tokens (in atto) to be sold 4000qbx
  const maxGasPrice = new web3.BigNumber(5000000000000000000) // max amount og gas allowed per transaction 50 gwei
  const minBuyingRequestInterval = new web3.BigNumber(60) // frequency between one call and the next one for an address (in seconds)
  const presalecap = new web3.BigNumber(8000000000000000000) // max amount of tokens to be sold

  if (process.argv.toString().indexOf('ropsten') !== -1) {
    startTime = 1509866990 + 500;
    endTime = startTime + 3600000;
    wallet = "0x7Ba631Ce4B83a05fcee8154B0Cf6765F1Fc417d4";
    console.log('Using ropsten network. Wallet address: ', wallet);
  } else {
    startTime = web3.eth.getBlock('latest').timestamp + 300;
    endTime = startTime + 3600000;
    wallet = web3.eth.accounts[0];
    console.log('Using testrpc network. Wallet address: ', wallet);
  }

  // deployer.deploy(QiibeeCrowdsale, startTime, endTime, rate, goal, cap, minInvest, maxCumulativeInvest, maxGasPrice, minBuyingRequestInterval, wallet);
  // deployer.deploy(QiibeePresale, startTime, endTime, goal, presalecap, maxGasPrice, minBuyingRequestInterval, wallet);
};
