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
    rate1: jsc.nat,
    rate2: jsc.nat,
    privatePresaleRate: jsc.nat,
    foundationWallet: accountGen,
    owner: accountGen
  }),

  waitBlockCommandGen: jsc.record({
    type: jsc.constant('waitBlock'),
    blocks: jsc.nat
  }),

  waitTimeCommandGen: jsc.record({
    type: jsc.constant('waitTime'),
    seconds: jsc.nat
  }),

  checkRateCommandGen: jsc.record({
    type: jsc.constant('checkRate')
  }),

  checkVaultCommandGen: jsc.record({
    type: jsc.constant('checkVault')
  }),

  buyTokensCommandGen: jsc.record({
    type: jsc.constant('buyTokens'),
    account: accountGen,
    beneficiary: accountGen,
    eth: jsc.nat
  }),

  mintTokensCommandGen: jsc.record({
    type: jsc.constant('mintTokens'),
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

  addPrivatePresaleTokensCommandGen: jsc.record({
    type: jsc.constant('addPrivatePresaleTokens'),
    beneficiaryAccount: accountGen,
    fromAccount: accountGen,
    eth: jsc.nat(0,200)
  }),

  claimRefundCommandGen: jsc.record({
    type: jsc.constant('claimRefund'),
    eth: jsc.nat(0, 200),
    fromAccount: accountGen
  }),

  transferCommandGen: jsc.record({
    type: jsc.constant('transfer'),
    lif: jsc.nat(0, 200),
    fromAccount: accountGen,
    toAccount: accountGen
  }),

  approveCommandGen: jsc.record({
    type: jsc.constant('approve'),
    lif: jsc.nat(0, 200),
    fromAccount: accountGen,
    spenderAccount: accountGen
  }),

  transferFromCommandGen: jsc.record({
    type: jsc.constant('transferFrom'),
    lif: jsc.nat(0, 200),
    senderAccount: accountGen,
    fromAccount: accountGen,
    toAccount: accountGen
  }),

  fundCrowdsaleBelowSoftCap: jsc.record({
    type: jsc.constant('fundCrowdsaleBelowGoal'),
    account: knownAccountGen, // we don't want this one to fail with 0x0 addresses
    finalize: jsc.bool
  }),

  addToWhitelistGen: jsc.record({
    type: jsc.constant('addToWhitelist'),
    senderAccount: accountGen,
    fromAccount: accountGen,
    toAccount: accountGen
  }),

  setBuyerRateGen: jsc.record({
    type: jsc.constant('setBuyerRate'),
    senderAccount: accountGen,
    fromAccount: accountGen,
    toAccount: accountGen
  })

};

