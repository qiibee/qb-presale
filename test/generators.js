var jsc = require('jsverify');

var help = require('./helpers');

// this is just to have web3 available and correctly initialized
artifacts.require('./QiibeeToken.sol');

const knownAccountGen = jsc.nat(web3.eth.accounts.length - 1);
const zeroAddressAccountGen = jsc.constant('zero');
const accountGen = jsc.oneof([zeroAddressAccountGen, knownAccountGen]);

function getAccount(account) {
  if (account == 'zero') {
    return help.zeroAddress;
  } else {
    return web3.eth.accounts[account];
  }
}

module.exports = {

  accountGen: accountGen,

  getAccount: getAccount,

  presaleGen: jsc.record({
    maxGasPrice: jsc.integer(0, 1000000000),
    maxCallFrequency: jsc.integer(0, 10000),
    goal: jsc.integer(0, 100000),
    cap: jsc.integer(0, 100000),
    foundationWallet: accountGen,
    owner: accountGen
  }),

  crowdsaleGen: jsc.record({
    rate: jsc.integer(0, 2000),
    goal: jsc.integer(0, 100000),
    cap: jsc.integer(0, 100000),
    minInvest: jsc.integer(0, 100000),
    maxInvest: jsc.integer(0, 100000),
    maxGasPrice: jsc.integer(0, 1000000000),
    maxCallFrequency: jsc.integer(0, 10000),
    foundationWallet: accountGen,
    owner: accountGen
  }),

  waitTimeCommandGen: jsc.record({
    type: jsc.constant('waitTime'),
    seconds: jsc.nat
  }),

  checkRateCommandGen: jsc.record({
    type: jsc.constant('checkRate'),
    fromAccount: accountGen
  }),

  setWalletCommandGen: jsc.record({
    type: jsc.constant('setWallet'),
    newAccount: accountGen,
    fromAccount: knownAccountGen
  }),

  buyTokensCommandGen: jsc.record({
    type: jsc.constant('buyTokens'),
    account: accountGen,
    beneficiary: accountGen,
    eth: jsc.nat(0, 200)
  }),

  burnTokensCommandGen: jsc.record({
    type: jsc.constant('burnTokens'),
    account: accountGen,
    tokens: jsc.integer(0, 1000000000)
  }),

  sendTransactionCommandGen: jsc.record({
    type: jsc.constant('sendTransaction'),
    account: accountGen,
    beneficiary: accountGen,
    eth: jsc.integer(0, 1000000000)
  }),

  presaleBuyTokensCommandGen: jsc.record({
    type: jsc.constant('presaleBuyTokens'),
    account: accountGen,
    beneficiary: accountGen,
    eth: jsc.nat(0, 200)
  }),

  presaleSendTransactionCommandGen: jsc.record({
    type: jsc.constant('presaleSendTransaction'),
    account: accountGen,
    beneficiary: accountGen,
    eth: jsc.integer(0, 1000000000)
  }),

  pauseCrowdsaleCommandGen: jsc.record({
    type: jsc.constant('pauseCrowdsale'),
    pause: jsc.bool,
    fromAccount: accountGen
  }),

  pauseTokenCommandGen: jsc.record({
    type: jsc.constant('pauseToken'),
    pause: jsc.bool,
    fromAccount: accountGen
  }),

  finalizeCrowdsaleCommandGen: jsc.record({
    type: jsc.constant('finalizeCrowdsale'),
    fromAccount: accountGen
  }),

  claimRefundCommandGen: jsc.record({
    type: jsc.constant('claimRefund'),
    investedEth: jsc.nat(0, 200),
    fromAccount: accountGen
  }),

  fundCrowdsaleBelowCapCommandGen: jsc.record({
    type: jsc.constant('fundCrowdsaleBelowCap'),
    account: knownAccountGen, // we don't want this one to fail with 0x0 addresses
    finalize: jsc.bool
  }),

  addAccreditedInvestorCommandGen: jsc.record({
    type: jsc.constant('addAccreditedInvestor'),
    investor: knownAccountGen,
    rate: jsc.integer(0, 20000),
    cliff: jsc.integer(0, 20000),
    vesting: jsc.integer(0, 20000),
    minInvest: jsc.integer(0, 1000000000),
    maxInvest: jsc.integer(0, 1000000000),
    fromAccount: accountGen,
  }),
};

