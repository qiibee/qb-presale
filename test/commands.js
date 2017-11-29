// var LifMarketValidationMechanism = artifacts.require('./LifMarketValidationMechanism.sol');
// var VestedPayment = artifacts.require('./VestedPayment.sol');

var BigNumber = web3.BigNumber;

require('chai').
  use(require('chai-bignumber')(BigNumber)).
  should();

var _ = require('lodash');
var jsc = require('jsverify');
var help = require('./helpers');
var gen = require('./generators');
var latestTime = require('./helpers/latestTime');
var {increaseTimeTestRPC, increaseTimeTestRPCTo} = require('./helpers/increaseTime');

var colors = require('colors');

const isZeroAddress = (addr) => addr === help.zeroAddress;

let isCouldntUnlockAccount = (e) => e.message.search('could not unlock signer account') >= 0;

function assertExpectedException(e, shouldThrow, addressZero, state, command) {
  let isKnownException = help.isInvalidOpcodeEx(e) ||
    (isCouldntUnlockAccount(e) && addressZero);
  if (!shouldThrow || !isKnownException) {
    throw(new ExceptionRunningCommand(e, state, command));
  }
}

function increaseEthBalance(state, accountIndex, ethDelta) {
  if (accountIndex == 'zero' )
    return state;
  else {
    state.ethBalances[accountIndex] = state.ethBalances[accountIndex].plus(ethDelta);
    return state;
  }
}

function decreaseEthBalance(state, accountIndex, ethDelta) {
  return increaseEthBalance(state, accountIndex, - ethDelta);
}

function trackGasFromLastBlock(state, accountIndex) {
  if (accountIndex == 'zero')
    return state;
  else {
    const block = web3.eth.getBlock('latest');
    assert.equal(1, block.transactions.length, 'we track gas from last block only when it had 1 tx');
    const gasCost = help.gasPrice.mul(block.gasUsed);

    return decreaseEthBalance(state, accountIndex, gasCost);
  }
}

async function runWaitTimeCommand(command, state) {
  await increaseTimeTestRPC(command.seconds);
  return state;
}

function ExceptionRunningCommand(e, state, command) {
  this.error = e;
  this.state = state;
  this.command = command;
}

ExceptionRunningCommand.prototype = Object.create(Error.prototype);
ExceptionRunningCommand.prototype.constructor = ExceptionRunningCommand;

function getBalance(state, account) {
  return state.balances[account] || new BigNumber(0);
}

function getTokenBalance(state, account) {
  return state.tokenBalances[account] || new BigNumber(0);
}

async function runCheckRateCommand(command, state) {
  let expectedRate = state.crowdsaleData.rate;
  let rate = await state.crowdsaleContract.rate();
  // let expectedRate = help.getCrowdsaleExpectedRate(state);
  // let rate = await state.crowdsaleContract.getRate();
  assert.equal(expectedRate, rate,
    'expected rate is different! Expected: ' + expectedRate + ', actual: ' + rate + '. blocks: ' + web3.eth.blockTimestamp +
    ', start/initialRate/preferentialRate: ' + state.crowdsaleData.startTime + '/' + state.crowdsaleData.rate + '/' + state.crowdsaleData.preferentialRate);
  help.debug(colors.green('Expected rate:', expectedRate, 'rate:', rate));
  return state;
}

async function runSetWalletCommand(command, state) {
  let from = gen.getAccount(command.fromAccount),
    newAccount = gen.getAccount(command.newAccount),
    hasZeroAddress = _.some([from, newAccount], isZeroAddress);

  let shouldThrow = hasZeroAddress ||
    command.fromAccount != state.owner;

  try {
    await state.crowdsaleContract.setWallet(newAccount, {from: from});
    assert.equal(false, shouldThrow, 'setWallet should have thrown but it didn\'t');
    help.debug(colors.green('SUCCESS setting wallet fromAccount:', from, 'newAccount:', newAccount));
    state.wallet = command.newAccount;
  } catch(e) {
    help.debug(colors.yellow('FAILED setting wallet fromAccount:', from, 'newAccount:', newAccount));
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runBuyTokensCommand(command, state) {
  let crowdsale = state.crowdsaleData,
    { startTime, endTime} = crowdsale,
    weiCost = web3.toWei(command.eth, 'ether'),
    nextTime = latestTime(),
    account = gen.getAccount(command.account),
    beneficiaryAccount = gen.getAccount(command.beneficiary),
    rate = state.crowdsaleData.rate,
    // rate = help.getCrowdsaleExpectedRate(state, account, weiCost),
    tokens = new BigNumber(command.eth).mul(rate),
    hasZeroAddress = _.some([account, beneficiaryAccount], isZeroAddress),
    newBalance = getBalance(state, command.beneficiary).plus(weiCost);

  let inTGE = nextTime >= startTime && nextTime <= endTime,
    capExceeded = state.weiRaised.plus(new BigNumber(help.toAtto(command.eth))).gt(crowdsale.cap),
    gasExceeded = (command.gasPrice > state.crowdsaleData.maxGasPrice) && inTGE,
    frequencyExceeded = (state.lastCallTime[command.account] && ((nextTime - state.lastCallTime[command.account]) < state.crowdsaleData.minBuyingRequestInterval)) || false,
    maxExceeded = newBalance.gt(state.crowdsaleData.maxCumulativeInvest),
    minNotReached = new BigNumber(help.toAtto(command.eth)).lt(state.crowdsaleData.minInvest);

  let shouldThrow = (!inTGE) ||
    state.crowdsalePaused ||
    crowdsale.rate == 0 ||
    crowdsale.goal == 0 ||
    crowdsale.cap == 0 ||
    crowdsale.maxGasPrice == 0 ||
    crowdsale.minBuyingRequestInterval == 0 ||
    crowdsale.goal.gt(crowdsale.cap) ||
    crowdsale.minInvest == 0 ||
    crowdsale.maxCumulativeInvest == 0 ||
    crowdsale.minInvest.gt(crowdsale.maxCumulativeInvest) ||
    state.crowdsaleFinalized ||
    hasZeroAddress ||
    weiCost == 0 ||
    maxExceeded ||
    minNotReached ||
    frequencyExceeded ||
    gasExceeded ||
    capExceeded;

  try {
    const tx = await state.crowdsaleContract.buyTokens(beneficiaryAccount, {value: weiCost, from: account, gasPrice: (command.gasPrice ? command.gasPrice : state.crowdsaleData.maxGasPrice)});
    assert.equal(false, shouldThrow, 'buyTokens should have thrown but it didn\'t');

    help.debug(colors.green('SUCCESS buying tokens, rate:', rate, 'eth:', command.eth, 'endBlocks:', crowdsale.endTime, 'blockTimestamp:', nextTime));

    state.purchases = _.concat(state.purchases,
      {tokens: tokens, rate: rate, wei: weiCost, beneficiary: command.beneficiary, account: command.account}
    );
    state.lastCallTime[command.account] = nextTime;
    state.balances[command.beneficiary] = getBalance(state, command.beneficiary).plus(weiCost);
    state.tokenBalances[command.beneficiary] = getTokenBalance(state, command.beneficiary).plus(tokens);
    state.weiRaised = state.weiRaised.plus(weiCost);
    state.tokensSold = state.tokensSold.plus(new BigNumber(help.toAtto(tokens)));
    state.crowdsaleSupply = state.crowdsaleSupply.plus(new BigNumber(help.toAtto(tokens)));

    state = decreaseEthBalance(state, command.account, weiCost);
    state = decreaseEthBalance(state, command.account, help.txGasCost(tx));
  } catch(e) {
    help.debug(colors.yellow('FAILURE buying tokens, gasExceeded:', gasExceeded, ', minNotReached:', minNotReached, ', maxExceeded:', maxExceeded, ', frequencyExceeded:', frequencyExceeded, ', capExceeded: ', capExceeded));
    state = trackGasFromLastBlock(state, command.account);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runSendTransactionCommand(command, state) {

  let crowdsale = state.crowdsaleData,
    { startTime, endTime} = crowdsale,
    weiCost = web3.toWei(command.eth, 'ether'),
    nextTime = latestTime(),
    account = gen.getAccount(command.account),
    beneficiaryAccount = gen.getAccount(command.beneficiary),
    rate = state.crowdsaleData.rate,
    // rate = help.getCrowdsaleExpectedRate(state, account, weiCost),
    tokens = new BigNumber(command.eth).mul(rate),
    hasZeroAddress = _.some([account, beneficiaryAccount], isZeroAddress),
    newBalance = getBalance(state, command.beneficiary).plus(weiCost);

  let inTGE = nextTime >= startTime && nextTime <= endTime,
    capExceeded = state.weiRaised.plus(new BigNumber(help.toWei(command.eth))).gt(crowdsale.cap),
    gasExceeded = (command.gasPrice > state.crowdsaleData.maxGasPrice) && inTGE,
    frequencyExceeded = (state.lastCallTime[command.account] && ((nextTime - state.lastCallTime[command.account]) < state.crowdsaleData.minBuyingRequestInterval)) || false,
    maxExceeded = newBalance.gt(state.crowdsaleData.maxCumulativeInvest),
    minNotReached = new BigNumber(help.toAtto(command.eth)).lt(state.crowdsaleData.minInvest);

  let shouldThrow = (!inTGE) ||
    state.crowdsalePaused ||
    crowdsale.rate == 0 ||
    crowdsale.goal == 0 ||
    crowdsale.cap == 0 ||
    crowdsale.maxGasPrice == 0 ||
    crowdsale.minBuyingRequestInterval == 0 ||
    crowdsale.goal.gt(crowdsale.cap) ||
    crowdsale.minInvest == 0 ||
    crowdsale.maxCumulativeInvest == 0 ||
    crowdsale.minInvest.gt(crowdsale.maxCumulativeInvest) ||
    state.crowdsaleFinalized ||
    hasZeroAddress ||
    weiCost == 0 ||
    maxExceeded ||
    minNotReached ||
    frequencyExceeded ||
    gasExceeded ||
    capExceeded;

  try {
    const tx = await state.crowdsaleContract.sendTransaction({value: weiCost, from: account});
    assert.equal(false, shouldThrow, 'sendTransaction should have thrown but it did not');

    help.debug(colors.green('SUCCESS buying tokens, rate:', rate, 'eth:', command.eth, 'endBlocks:', crowdsale.endTime, 'blockTimestamp:', nextTime));

    state.purchases = _.concat(state.purchases,
      {tokens: tokens, rate: rate, wei: weiCost, beneficiary: command.beneficiary, account: command.account}
    );
    state.lastCallTime[command.account] = nextTime;
    state.balances[command.beneficiary] = getBalance(state, command.beneficiary).plus(weiCost);
    state.tokenBalances[command.beneficiary] = getTokenBalance(state, command.beneficiary).plus(tokens);
    state.weiRaised = state.weiRaised.plus(weiCost);
    state.tokensSold = state.tokensSold.plus(new BigNumber(help.toAtto(tokens)));
    state.crowdsaleSupply = state.crowdsaleSupply.plus(new BigNumber(help.toAtto(tokens)));

    state = decreaseEthBalance(state, command.account, weiCost);
    state = decreaseEthBalance(state, command.account, help.txGasCost(tx));
  } catch(e) {
    help.debug(colors.yellow('FAILURE buying tokens, gasExceeded:', gasExceeded, ', minNotReached:', minNotReached, ', maxExceeded:', maxExceeded, ', frequencyExceeded:', frequencyExceeded, ', capExceeded: ', capExceeded));

    state = trackGasFromLastBlock(state, command.account);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runPresaleBuyTokensCommand(command, state) {
  let presale = state.presaleData,
    { startTime, endTime, vestFromTime} = presale,
    weiCost = web3.toWei(command.eth, 'ether'),
    nextTime = latestTime(),
    account = gen.getAccount(command.account),
    beneficiaryAccount = gen.getAccount(command.beneficiary),
    accredited = state.accredited[command.account],
    rate = state.presaleData.rate,
    tokens = accredited ? new BigNumber(command.eth).mul(rate) : null,
    hasZeroAddress = _.some([account, beneficiaryAccount], isZeroAddress),
    newBalance = getBalance(state, command.account).plus(weiCost);

  let inTGE = nextTime >= startTime && nextTime <= endTime,
    capExceeded = state.weiRaised.plus(new BigNumber(help.toAtto(command.eth))).gt(presale.cap),
    gasExceeded = (command.gasPrice > state.presaleData.maxGasPrice) && inTGE,
    frequencyExceeded = (state.lastCallTime[command.account] && ((nextTime - state.lastCallTime[command.account]) < state.presaleData.minBuyingRequestInterval)) || false,
    maxExceeded = accredited ? newBalance.gt(accredited.maxCumulativeInvest) : null,
    minNotReached = accredited ? new BigNumber(help.toAtto(command.eth)).lt(accredited.minInvest) : null;

  let shouldThrow = (!inTGE) ||
    !accredited ||
    state.presalePaused ||
    presale.goal == 0 ||
    presale.cap == 0 ||
    presale.maxGasPrice == 0 ||
    presale.minBuyingRequestInterval == 0 ||
    state.presaleFinalized ||
    hasZeroAddress ||
    weiCost == 0 ||
    maxExceeded ||
    minNotReached ||
    frequencyExceeded ||
    gasExceeded ||
    capExceeded;

  try {
    const tx = await state.presaleContract.buyTokens(beneficiaryAccount, {value: weiCost, from: account, gasPrice: (command.gasPrice ? command.gasPrice : state.presaleData.maxGasPrice)});
    assert.equal(false, shouldThrow, 'buyTokens should have thrown but it didn\'t');

    state.purchases = _.concat(state.purchases,
      {tokens: tokens, rate: rate, wei: weiCost, beneficiary: command.beneficiary, account: command.account}
    );
    state.lastCallTime[command.account] = nextTime;
    state.balances[command.account] = getBalance(state, command.account).plus(weiCost);
    state.tokenBalances[command.beneficiary] = getTokenBalance(state, command.beneficiary).plus(tokens);
    state.weiRaised = state.weiRaised.plus(weiCost);
    state.tokensSold = state.tokensSold.plus(new BigNumber(help.toAtto(tokens)));
    state.presaleSupply = state.presaleSupply.plus(new BigNumber(help.toAtto(tokens)));

    if (accredited.cliff > 0 && accredited.vesting >= accredited.cliff) {
      (await state.token.tokenGrantsCount(beneficiaryAccount)).should.be.bignumber.gt(new BigNumber(0));
      new BigNumber(0).should.be.bignumber.equal(await state.token.transferableTokens(beneficiaryAccount, nextTime));
      const timeAfterVested = vestFromTime + accredited.cliff + accredited.vesting;
      const supply = new BigNumber(help.toAtto(state.tokenBalances[command.beneficiary]));
      supply.should.be.bignumber.equal(await state.token.transferableTokens(beneficiaryAccount, timeAfterVested));
    } else {
      new BigNumber(0).should.be.bignumber.equal(await state.token.tokenGrantsCount(beneficiaryAccount));
    }

    state = decreaseEthBalance(state, command.account, weiCost);
    state = decreaseEthBalance(state, command.account, help.txGasCost(tx));
    help.debug(colors.green('SUCCESS buying tokens, rate:', rate, 'eth:', command.eth, 'endBlocks:', presale.endTime, 'blockTimestamp:', nextTime));

  } catch(e) {
    help.debug(colors.yellow('FAILURE buying tokens, gasExceeded:', gasExceeded, ', minNotReached:', minNotReached, ', maxExceeded:', maxExceeded, ', frequencyExceeded:', frequencyExceeded, ', capExceeded: ', capExceeded));
    state = trackGasFromLastBlock(state, command.account);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runPresaleSendTransactionCommand(command, state) {
  let presale = state.presaleData,
    { startTime, endTime, vestFromTime} = presale,
    weiCost = web3.toWei(command.eth, 'ether'),
    nextTime = latestTime(),
    account = gen.getAccount(command.account),
    accredited = state.accredited[command.account],
    rate = state.presaleData.rate,
    tokens = accredited ? new BigNumber(command.eth).mul(rate) : null,
    hasZeroAddress = _.some([account], isZeroAddress),
    newBalance = getBalance(state, command.account).plus(weiCost);

  let inTGE = nextTime >= startTime && nextTime <= endTime,
    capExceeded = state.weiRaised.plus(new BigNumber(help.toAtto(command.eth))).gt(presale.cap),
    gasExceeded = (command.gasPrice > state.presaleData.maxGasPrice) && inTGE,
    frequencyExceeded = (state.lastCallTime[command.account] && ((nextTime - state.lastCallTime[command.account]) < state.presaleData.minBuyingRequestInterval)) || false,
    maxExceeded = accredited ? newBalance.gt(accredited.maxCumulativeInvest) : null,
    minNotReached = accredited ? new BigNumber(help.toAtto(command.eth)).lt(accredited.minInvest) : null;

  let shouldThrow = (!inTGE) ||
    !accredited ||
    state.presalePaused ||
    presale.cap == 0 ||
    presale.maxGasPrice == 0 ||
    presale.minBuyingRequestInterval == 0 ||
    state.presaleFinalized ||
    hasZeroAddress ||
    weiCost == 0 ||
    maxExceeded ||
    minNotReached ||
    frequencyExceeded ||
    gasExceeded ||
    capExceeded;

  try {
    const tx = await state.presaleContract.sendTransaction({value: weiCost, from: account});
    assert.equal(false, shouldThrow, 'sendTransaction should have thrown but it did not');

    state.purchases = _.concat(state.purchases,
      {tokens: tokens, rate: rate, wei: weiCost, beneficiary: command.account, account: command.account}
    );
    state.lastCallTime[command.account] = nextTime;
    state.balances[command.account] = getBalance(state, command.account).plus(weiCost);
    state.tokenBalances[command.account] = getTokenBalance(state, command.account).plus(tokens);
    state.weiRaised = state.weiRaised.plus(weiCost);
    state.tokensSold = state.tokensSold.plus(new BigNumber(help.toAtto(tokens)));
    state.presaleSupply = state.presaleSupply.plus(new BigNumber(help.toAtto(tokens)));

    if (accredited.cliff > 0 && accredited.vesting >= accredited.cliff) {
      const purchases = _.filter(state.purchases, function (item) {
        return item.beneficiary == command.account;
      });
      (await state.token.tokenGrantsCount(account)).should.be.bignumber.equal(new BigNumber(purchases.length));
      new BigNumber(0).should.be.bignumber.equal(await state.token.transferableTokens(account, nextTime));
      const timeAfterVested = vestFromTime + accredited.cliff + accredited.vesting;
      const supply = new BigNumber(help.toAtto(state.tokenBalances[command.account]));
      supply.should.be.bignumber.equal(await state.token.transferableTokens(account, timeAfterVested));

    } else {
      new BigNumber(0).should.be.bignumber.equal(await state.token.tokenGrantsCount(account));
    }

    state = decreaseEthBalance(state, command.account, weiCost);
    state = decreaseEthBalance(state, command.account, help.txGasCost(tx));

    help.debug(colors.green('SUCCESS buying tokens, rate:', rate, 'eth:', command.eth, 'endBlocks:', presale.endTime, 'blockTimestamp:', nextTime));
  } catch(e) {
    state = trackGasFromLastBlock(state, command.account);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
    help.debug(colors.yellow('FAILURE buying tokens, gasExceeded:', gasExceeded, ', minNotReached:', minNotReached, ', maxExceeded:', maxExceeded, ', frequencyExceeded:', frequencyExceeded, ', capExceeded: ', capExceeded));
  }
  return state;
}

async function runDistributeTokensCommand(command, state) {
  let presale = state.presaleData,
    { vestFromTime, endTime} = presale,
    nextTime = latestTime(),
    account = gen.getAccount(command.fromAccount),
    beneficiary = gen.getAccount(command.beneficiary),
    amount = command.amount,
    cliff = command.cliff,
    vesting = command.vesting,
    revokable = command.revokable,
    burnsOnRevoke = command.burnsOnRevoke,
    hasZeroAddress = _.some([account, beneficiary], isZeroAddress);

  let afterFundraising = (nextTime >= endTime || state.weiRaised >= presale.cap),
    capExceeded = state.tokensDistributed.plus(new BigNumber(help.toAtto(command.amount))).gt(presale.distributionCap);

  let shouldThrow = !afterFundraising ||
    state.presalePaused ||
    amount == 0 ||
    vesting < cliff ||
    state.presaleFinalized ||
    hasZeroAddress ||
    capExceeded ||
    command.fromAccount != state.owner;

  try {
    await state.presaleContract.distributeTokens(beneficiary, help.toAtto(amount), cliff, vesting, revokable, burnsOnRevoke, {from: account, gasPrice: (command.gasPrice ? command.gasPrice : state.presaleData.maxGasPrice)});

    assert.equal(false, shouldThrow, 'distribute tokens should have thrown but it didn\'t');

    // state.purchases = _.concat(state.purchases,
    //   {tokens: tokens, rate: rate, wei: weiCost, beneficiary: command.beneficiary, account: command.account}
    // );

    state.tokensDistributed = state.tokensDistributed.plus(new BigNumber(help.toAtto(amount)));
    state.presaleSupply = state.presaleSupply.plus(new BigNumber(help.toAtto(amount)));
    state.tokenBalances[command.beneficiary] = getTokenBalance(state, command.beneficiary).plus(amount);

    if (cliff > 0 && vesting >= cliff) {
      (await state.token.tokenGrantsCount(beneficiary)).should.be.bignumber.gt(new BigNumber(0));
      new BigNumber(0).should.be.bignumber.equal(await state.token.transferableTokens(beneficiary, nextTime));
      const timeAfterVested = vestFromTime + cliff + vesting;
      const supply = new BigNumber(help.toAtto(state.tokenBalances[command.beneficiary]));
      supply.should.be.bignumber.equal(await state.token.transferableTokens(beneficiary, timeAfterVested));
    } else {
      new BigNumber(0).should.be.bignumber.equal(await state.token.tokenGrantsCount(beneficiary));
    }
    help.debug(colors.green('SUCCESS distributing tokens'));

  } catch(e) {
    help.debug(colors.yellow('FAILURE distributing tokens, capExceeded: ', capExceeded));
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runAddAccreditedCommand(command, state) {
  let account = gen.getAccount(command.fromAccount),
    investor = gen.getAccount(command.investor),
    cliff = command.cliff,
    vesting = command.vesting,
    revokable = command.revokable,
    burnsOnTokens = command.burnsOnTokens,
    minInvest = command.minInvest,
    maxCumulativeInvest = command.maxCumulativeInvest;

  let hasZeroAddress = _.some([account, investor], isZeroAddress);

  let shouldThrow = hasZeroAddress ||
      vesting < cliff ||
      minInvest == 0 ||
      maxCumulativeInvest == 0 ||
      minInvest > maxCumulativeInvest ||
      command.fromAccount != state.owner;

  try {
    await state.presaleContract.addAccreditedInvestor(investor, cliff, vesting, revokable, burnsOnTokens, help.toWei(minInvest), help.toWei(maxCumulativeInvest), {from: account});
    help.debug(colors.green('SUCCESS adding accredited investor'));

    assert.equal(false, shouldThrow, 'add to whitelist should have thrown but it did not');
    state.accredited[command.investor] = {cliff: cliff, vesting: vesting, revokable, burnsOnTokens, minInvest: help.toWei(minInvest), maxCumulativeInvest: help.toWei(maxCumulativeInvest)};
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
    help.debug(colors.yellow('FAILURE adding accredited investor'));
  }
  return state;
}

async function runRemoveAccreditedCommand(command, state) {
  let account = gen.getAccount(command.fromAccount),
    investor = gen.getAccount(command.investor);

  let hasZeroAddress = _.some([account, investor], isZeroAddress);

  let shouldThrow = hasZeroAddress ||
    command.fromAccount != state.owner;

  try {
    await state.presaleContract.removeAccreditedInvestor(investor, {from: account});
    help.debug(colors.green('SUCCESS removing accredited investor'));

    assert.equal(false, shouldThrow, 'add to whitelist should have thrown but it did not');
    delete state.accredited[command.investor];
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
    help.debug(colors.yellow('FAILURE removing accredited investor'));
  }
  return state;
}

async function runPauseCrowdsaleCommand(command, state) {
  let account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = (state.crowdsalePaused == command.pause) ||
    (command.fromAccount != state.owner) ||
    hasZeroAddress;

  help.debug(colors.green('pausing crowdsale, previous state:', state.crowdsalePaused, 'new state:', command.pause));
  try {
    let tx;
    if (command.pause) {
      tx = await state.crowdsaleContract.pause({from: account});
    } else {
      tx = await state.crowdsaleContract.unpause({from: account});
    }
    assert.equal(false, shouldThrow);
    state.crowdsalePaused = command.pause;
    state = decreaseEthBalance(state, command.fromAccount, help.txGasCost(tx));
  } catch(e) {
    state = trackGasFromLastBlock(state, command.fromAccount);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runPausePresaleCommand(command, state) {
  let account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = (state.presalePaused == command.pause) ||
    (command.fromAccount != state.owner) ||
    hasZeroAddress;

  help.debug(colors.green('pausing crowdsale, previous state:', state.presalePaused, 'new state:', command.pause));
  try {
    let tx;
    if (command.pause) {
      tx = await state.presaleContract.pause({from: account});
    } else {
      tx = await state.presaleContract.unpause({from: account});
    }
    assert.equal(false, shouldThrow);
    state.presalePaused = command.pause;
    state = decreaseEthBalance(state, command.fromAccount, help.txGasCost(tx));
  } catch(e) {
    state = trackGasFromLastBlock(state, command.fromAccount);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runPauseTokenCommand(command, state) {
  let account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = (state.tokenPaused == command.pause) ||
    !state.crowdsaleFinalized ||
    command.fromAccount != state.tokenOwner ||
    hasZeroAddress;

  try {
    let tx;
    if (command.pause) {
      tx = await state.token.pause({from: account});
    } else {
      tx = await state.token.unpause({from: account});
    }
    assert.equal(false, shouldThrow);
    help.debug(colors.green('SUCCESS pausing token, previous state:', state.tokenPaused, 'new state:', command.pause));

    state.tokenPaused = command.pause;
    state = decreaseEthBalance(state, command.fromAccount, help.txGasCost(tx));
  } catch(e) {
    help.debug(colors.yellow('FAILURE pausing token, previous state:', state.tokenPaused, 'new state:', command.pause));
    state = trackGasFromLastBlock(state, command.fromAccount);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runFinalizeCrowdsaleCommand(command, state) {
  let nextTimestamp = latestTime(),
    account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account),
    capReached = state.weiRaised.eq(state.crowdsaleData.cap);

  let shouldThrow = state.crowdsaleFinalized ||
    state.crowdsalePaused ||
    hasZeroAddress ||
    (nextTimestamp < state.crowdsaleData.endTime && !capReached) ||
    command.fromAccount != state.owner;

  try {
    let goalReached = state.weiRaised.eq(state.crowdsaleData.goal),
      tokenOwnerBeforeFinalize = await state.token.owner(),
      tx = await state.crowdsaleContract.finalize({from: account});

    if (!help.inCoverage()) { // gas cannot be measuyellow correctly when running coverage
      assert(tx.receipt.gasUsed < 6700000,
        'gas used in finalize (' + tx.receipt.gasUsed + ') should be less than gas limit in mainnet');
    }
    state = decreaseEthBalance(state, command.fromAccount, help.txGasCost(tx));
    let tokenOwnerAfterFinalize = await state.token.owner();

    if (goalReached) {
      state = increaseEthBalance(state, state.wallet, state.weiRaised); //TODO: check this call
      //check token ownership change
      assert.notEqual(tokenOwnerBeforeFinalize, tokenOwnerAfterFinalize);
      assert.equal(gen.getAccount(state.wallet), tokenOwnerAfterFinalize);

      let totalSupply = new BigNumber(state.crowdsaleData.FOUNDATION_SUPPLY).plus(state.tokensSold);

      totalSupply.should.be.bignumber.equal(
        await state.token.totalSupply()
      );
    }
    assert.equal(false, shouldThrow);

    state.crowdsaleFinalized = true;
    state.goalReached = goalReached;
    state.tokenPaused = false;
    state.tokenOwner = state.wallet; //TODO: change state.owner or token owner??
    help.debug(colors.green('SUCCESS: finishing crowdsale on block', nextTimestamp, ', from address:', gen.getAccount(command.fromAccount), ', funded:', goalReached, 'gas used: ', tx.receipt.gasUsed));

  } catch(e) {
    help.debug(colors.yellow('FAILURE finishing crowdsale, on block', nextTimestamp, ', from address:', gen.getAccount(command.fromAccount), ', funded: ', state.goalReached));
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runFinalizePresaleCommand(command, state) {

  let nextTimestamp = latestTime(),
    account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account),
    capReached = state.weiRaised.eq(state.presaleData.cap);

  let shouldThrow = state.presaleFinalized ||
    state.presalePaused ||
    hasZeroAddress ||
    (nextTimestamp < state.presaleData.endTime && !capReached) ||
    command.fromAccount != state.owner;

  try {
    let tokenOwnerBeforeFinalize = await state.token.owner(),
      tx = await state.presaleContract.finalize({from: account});
    if (!help.inCoverage()) { // gas cannot be measuyellow correctly when running coverage
      assert(tx.receipt.gasUsed < 6700000,
        'gas used in finalize (' + tx.receipt.gasUsed + ') should be less than gas limit in mainnet');
    }
    state = decreaseEthBalance(state, command.fromAccount, help.txGasCost(tx));
    let tokenOwnerAfterFinalize = await state.token.owner();

    state = increaseEthBalance(state, state.wallet, state.weiRaised); //TODO: check this call
    //check token ownership change
    assert.notEqual(tokenOwnerBeforeFinalize, tokenOwnerAfterFinalize);
    assert.equal(gen.getAccount(state.wallet), tokenOwnerAfterFinalize);

    let totalTokens = state.tokensDistributed.plus(state.tokensSold);
    new BigNumber(await state.token.totalSupply()).should.be.bignumber.equal(totalTokens);

    assert.equal(false, shouldThrow, 'finalizeCrowdsale should have thrown but it did not');
    state.presaleFinalized = true;
    state.tokenPaused = false;
    state.tokenOwner = state.wallet; //TODO: change state.owner or token owner??
    help.debug(colors.green('SUCCESS: finishing presale on block', nextTimestamp, ', from address:', gen.getAccount(command.fromAccount), 'gas used: ', tx.receipt.gasUsed));

  } catch(e) {
    help.debug(colors.yellow('FAILURE finishing presale, on block', nextTimestamp, ', from address:', gen.getAccount(command.fromAccount), ', funded:'));
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runClaimRefundCommand(command, state) {

  let account = gen.getAccount(command.fromAccount),
    purchases = _.filter(state.purchases, (p) => p.account == command.fromAccount),
    hasZeroAddress = isZeroAddress(account),
    investedWei = _.sumBy(purchases, (p) => p.wei);

  let shouldThrow = !state.crowdsaleFinalized ||
    state.goalReached ||
    hasZeroAddress ||
    state.vault[command.fromAccount] > 0;

  try {
    let currentBalance = web3.eth.getBalance(account);

    const tx = await state.crowdsaleContract.claimRefund({from: account, gasPrice: 0});
    assert.equal(false, shouldThrow, 'claimRefund should have thrown but it did not');

    let balanceAfterClaimRefund = web3.eth.getBalance(account);
    assert.equal(balanceAfterClaimRefund.sub(currentBalance), investedWei);

    help.debug(colors.green('investedEth: ', investedWei, 'balance before claiming: ', currentBalance, ', balance after claiming:', balanceAfterClaimRefund, 'vault state:', JSON.stringify(state.vault)));

    state = increaseEthBalance(state, command.fromAccount, investedWei);
    state = decreaseEthBalance(state, command.fromAccount, help.txGasCost(tx));
  } catch(e) {
    state = trackGasFromLastBlock(state, command.fromAccount);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runBurnTokensCommand(command, state) {
  let account = gen.getAccount(command.account),
    balance = getTokenBalance(state, command.account),
    hasZeroAddress = isZeroAddress(account),
    tokens = new BigNumber(help.toAtto(command.tokens));

  let shouldThrow = state.tokenPaused ||
    (balance < command.tokens) ||
    command.tokens == 0 ||
    hasZeroAddress;

  try {
    const tx = await state.token.burn(tokens, {from: account});
    assert.equal(false, shouldThrow, 'burn should have thrown but it did not');
    help.debug(colors.green('SUCCESS burning tokens, balance:', balance, 'tokens: ', command.tokens));

    state.tokenBalances[account] = balance.minus(tokens);
    state.crowdsaleSupply = state.crowdsaleSupply.minus(tokens);

    state = decreaseEthBalance(state, command.account, help.txGasCost(tx));
  } catch(e) {
    help.debug(colors.yellow('FAILURE burning tokens, balance:', balance, 'tokens: ', command.tokens));
    state = trackGasFromLastBlock(state, command.account);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runFundCrowdsaleBelowCap(command, state) {
  if (!state.crowdsaleFinalized) {

    // unpause the crowdsale if needed
    if (state.crowdsalePaused) {
      state = await runPauseCrowdsaleCommand({pause: false, fromAccount: state.owner}, state);
    }

    let goal = state.crowdsaleData.goal,
      weiRaised = state.weiRaised,
      from = command.account;

    if (goal > weiRaised) {
      // wait for crowdsale startTime
      if (latestTime() < state.crowdsaleData.startTime) {
        await increaseTimeTestRPCTo(state.crowdsaleData.startTime);
      }

      // reach the goal
      let ethToGoal = help.fromAtto(goal.minus(weiRaised)),
        buyTokensCommand = {account: command.account, eth: ethToGoal, beneficiary: command.account};
      state = await runBuyTokensCommand(buyTokensCommand, state);
    }

    new BigNumber(state.weiRaised).should.be.bignumber.equal(goal);

    if (command.finalize) {
      // wait for crowdsale endTime
      if (latestTime() < state.crowdsaleData.endTime) {
        await increaseTimeTestRPCTo(state.crowdsaleData.endTime + 1);
      }
      state = await runFinalizeCrowdsaleCommand({fromAccount: from}, state);
      // verify that the crowdsale is finalized and funded
      assert.equal(from == state.owner, state.crowdsaleFinalized);
      assert.equal(from == state.owner, state.goalReached);

    }
  }

  return state;
}

const crowdsaleCommands = {
  waitTime: {gen: gen.waitTimeCommandGen, run: runWaitTimeCommand},
  checkRate: {gen: gen.checkRateCommandGen, run: runCheckRateCommand},
  setWallet: {gen: gen.setWalletCommandGen, run: runSetWalletCommand},
  buyTokens: {gen: gen.buyTokensCommandGen, run: runBuyTokensCommand},
  burnTokens: {gen: gen.burnTokensCommandGen, run: runBurnTokensCommand},
  sendTransaction: {gen: gen.sendTransactionCommandGen, run: runSendTransactionCommand},
  pauseCrowdsale: {gen: gen.pauseCrowdsaleCommandGen, run: runPauseCrowdsaleCommand},
  pauseToken: {gen: gen.pauseTokenCommandGen, run: runPauseTokenCommand},
  finalizeCrowdsale: {gen: gen.finalizeCrowdsaleCommandGen, run: runFinalizeCrowdsaleCommand},
  claimRefund: {gen: gen.claimRefundCommandGen, run: runClaimRefundCommand},
  fundCrowdsaleBelowCap: {gen: gen.fundCrowdsaleBelowCapCommandGen, run: runFundCrowdsaleBelowCap},
};

const presaleCommands = {
  presaleBuyTokens: {gen: gen.presaleBuyTokensCommandGen, run: runPresaleBuyTokensCommand},
  presaleSendTransaction: {gen: gen.presaleSendTransactionCommandGen, run: runPresaleSendTransactionCommand},
  distributeTokens: {gen: gen.distributeTokensCommandGen, run: runDistributeTokensCommand},
  pausePresale: {gen: gen.pausePresaleCommandGen, run: runPausePresaleCommand},
  addAccredited: { gen: gen.addAccreditedCommandGen, run: runAddAccreditedCommand},
  removeAccredited: { gen: gen.removeAccreditedCommandGen, run: runRemoveAccreditedCommand},
  finalizePresale: {gen: gen.finalizePresaleCommandGen, run: runFinalizePresaleCommand}
};

const commands = _.merge({}, presaleCommands, crowdsaleCommands);

module.exports = {

  crowdsaleCommandsGen: jsc.oneof(_.map(crowdsaleCommands, (c) => c.gen)),
  presaleCommandsGen: jsc.oneof(_.map(presaleCommands, (c) => c.gen)),
  commands: commands,

  findCommand: (type) => {
    let command = commands[type];
    if (command === undefined)
      throw(new Error('unknown command ' + type));
    return command;
  },

  ExceptionRunningCommand: ExceptionRunningCommand
};
