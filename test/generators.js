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

let cap = jsc.integer(0, 100000),
  max = jsc.integer(0, 100000);

while (cap/max > 10) {
  max = jsc.integer(0, 100000);
}

let crowdsale = {
  rate: jsc.integer(0, 2000),
  cap: cap,
  minInvest: jsc.integer(0, 100000),
  maxCumulativeInvest: max,
  maxGasPrice: jsc.integer(0, 1000000000),
  owner: accountGen,
  foundationWallet: accountGen
};

module.exports = {

  accountGen: accountGen,

  getAccount: getAccount,

  presaleGen: jsc.record({
    maxGasPrice: jsc.integer(0, 1000000000),
    minBuyingRequestInterval: jsc.integer(0, 10000),
    vestFromTime: jsc.integer(0, 1000000000000),
    rate: jsc.integer(0, 2000),
    cap: jsc.integer(0, 100000),
    distributionCap: jsc.integer(0, 10000000),
    foundationWallet: accountGen,
    owner: accountGen
  }),

  crowdsaleGen: jsc.record(crowdsale),

  waitTimeCommandGen: jsc.record({
    type: jsc.constant('waitTime'),
    seconds: jsc.nat
  }),

  buyTokensCommandGen: jsc.record({
    type: jsc.constant('buyTokens'),
    account: accountGen,
    beneficiary: accountGen,
    eth: jsc.nat(0, 200)
  }),

  setWalletCommandGen: jsc.record({
    type: jsc.constant('setWallet'),
    newAccount: accountGen,
    fromAccount: knownAccountGen
  }),

  validatePurchaseCommandGen: jsc.record({
    type: jsc.constant('validatePurchase'),
    account: accountGen,
    beneficiary: accountGen,
    acceptance: jsc.bool,
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
    eth: jsc.integer(0, 200)
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
    eth: jsc.integer(0, 200)
  }),

  distributeTokensCommandGen: jsc.record({
    type: jsc.constant('distributeTokens'),
    fromAccount: accountGen,
    beneficiary: accountGen,
    amount: jsc.integer(0, 10000000),
    cliff: jsc.integer(0, 20000),
    vesting: jsc.integer(0, 20000),
    revokable: jsc.bool,
    burnsOnRevoke: jsc.bool,
  }),

  pauseCrowdsaleCommandGen: jsc.record({
    type: jsc.constant('pauseCrowdsale'),
    pause: jsc.bool,
    fromAccount: accountGen
  }),

  pausePresaleCommandGen: jsc.record({
    type: jsc.constant('pausePresale'),
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

  finalizePresaleCommandGen: jsc.record({
    type: jsc.constant('finalizePresale'),
    fromAccount: accountGen
  }),

  fundCrowdsaleToCapCommandGen: jsc.record({
    type: jsc.constant('fundCrowdsaleToCap'),
    account: knownAccountGen, // we don't want this one to fail with 0x0 addresses
    finalize: jsc.bool
  }),

  addAccreditedCommandGen: jsc.record({
    type: jsc.constant('addAccredited'),
    investor: knownAccountGen,
    rate: jsc.integer(0, 20000),
    cliff: jsc.integer(0, 20000),
    vesting: jsc.integer(0, 20000),
    revokable: jsc.bool,
    burnsOnTokens: jsc.bool,
    minInvest: jsc.integer(0, 1000000000),
    maxCumulativeInvest: jsc.integer(0, 1000000000),
    fromAccount: accountGen,
  }),

  removeAccreditedCommandGen: jsc.record({
    type: jsc.constant('removeAccredited'),
    investor: knownAccountGen,
    fromAccount: accountGen,
  }),
};

