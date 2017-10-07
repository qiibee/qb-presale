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

  crowdsaleGen: jsc.record({
    initialRate: jsc.nat,
    preferentialRate: jsc.nat,
    goal: jsc.nat,
    cap: jsc.nat,
    minInvest: jsc.nat,
    maxInvest: jsc.nat,
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
    eth: jsc.nat
  }),

  burnTokensCommandGen: jsc.record({
    type: jsc.constant('burnTokens'),
    account: accountGen,
    tokens: jsc.nat
  }),

  sendTransactionCommandGen: jsc.record({
    type: jsc.constant('sendTransaction'),
    account: accountGen,
    beneficiary: accountGen,
    eth: jsc.nat
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

  addToWhitelistCommandGen: jsc.record({
    type: jsc.constant('addToWhitelist'),
    whitelistedAccount: knownAccountGen,
    fromAccount: accountGen,
  }),

  setBuyerRateCommandGen: jsc.record({
    type: jsc.constant('setBuyerRate'),
    rate: jsc.nat,
    whitelistedAccount: knownAccountGen,
    fromAccount: accountGen,
  })

};

