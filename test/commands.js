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

async function runCheckRateCommand(command, state) {
  let from = gen.getAccount(command.fromAccount);
  let expectedRate = help.getCrowdsaleExpectedRate(state, from);
  let rate = await state.crowdsaleContract.getRate({from: from});

  assert.equal(expectedRate, rate,
    'expected rate is different! Expected: ' + expectedRate + ', actual: ' + rate + '. blocks: ' + web3.eth.blockTimestamp +
    ', start/initialRate/preferentialRate: ' + state.crowdsaleData.startTime + '/' + state.crowdsaleData.initialRate + '/' + state.crowdsaleData.preferentialRate);
  help.debug(colors.yellow('Expected rate:', expectedRate, 'rate:', rate));
  return state;
}

async function runSetWalletCommand(command, state) {
  let from = gen.getAccount(command.fromAccount),
    newAccount = gen.getAccount(command.newAccount),
    hasZeroAddress = _.some([from, newAccount], isZeroAddress);

  let shouldThrow = hasZeroAddress ||
    command.fromAccount != state.owner;

  try {
    help.debug(colors.yellow('setWallet fromAccount:', from, 'newAccount:', newAccount));
    await state.crowdsaleContract.setWallet(newAccount, {from: from});
    assert.equal(false, shouldThrow, 'setWallet should have thrown but it didn\'t');
    state.wallet = newAccount;
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runBuyTokensCommand(command, state) {
  let crowdsale = state.crowdsaleData,
    { startPreTime, endPreTime, startTime, endTime} = crowdsale,
    weiCost = web3.toWei(command.eth, 'ether'),
    nextTime = latestTime(),
    account = gen.getAccount(command.account),
    beneficiaryAccount = gen.getAccount(command.beneficiary),
    rate = help.getCrowdsaleExpectedRate(state, account, weiCost),
    tokens = new BigNumber(command.eth).mul(rate),
    hasZeroAddress = _.some([account, beneficiaryAccount], isZeroAddress),
    newBalance = getBalance(state, command.beneficiary).plus(help.toAtto(tokens));

  let inPreTGE = nextTime >= startPreTime && nextTime <= endPreTime;

  let capExceeded = state.tokensSold.plus(help.toAtto(tokens)).gt(crowdsale.cap);

  let shouldThrow = (inPreTGE && !_.includes(state.whitelist, account)) ||
    (nextTime < startPreTime) ||
    (nextTime > endPreTime && nextTime < startTime) ||
    (nextTime > endTime) ||
    (state.crowdsalePaused) ||
    //TODO: add reuqirements for TOTAL SUPPLY, FOUNDATION, etc
    (crowdsale.initialRate == 0) ||
    (crowdsale.goal == 0) ||
    (crowdsale.cap == 0) ||
    (crowdsale.minInvest == 0) ||
    (crowdsale.maxInvest == 0) ||
    (state.crowdsaleFinalized) ||
    hasZeroAddress ||
    (command.eth == 0) ||
    (state.lastCallTime[command.beneficiary] && (nextTime - state.lastCallTime[command.beneficiary]) < state.crowdsaleData.maxCallFrequency) ||
    command.gasPrice > state.crowdsaleData.maxGasPrice ||
    (newBalance.gt(state.crowdsaleData.maxInvest) && nextTime >= startTime) ||
    (help.toAtto(tokens).lt(state.crowdsaleData.minInvest) && nextTime >= startTime) ||
    capExceeded;

  try {
    help.debug(colors.yellow('buyTokens rate:', rate, 'eth:', command.eth, 'endBlocks:', crowdsale.endTime, 'blockTimestamp:', nextTime));
    //await state.crowdsaleContract.buyTokens(beneficiaryAccount, {value: weiCost, from: account});
    //gasPrice price (in ether) of one unit of gas specified in the transaction
    await state.crowdsaleContract.buyTokens(beneficiaryAccount, {value: weiCost, from: account, gasPrice: (command.gasPrice ? command.gasPrice : state.crowdsaleData.maxGasPrice)});
    assert.equal(false, shouldThrow, 'buyTokens should have thrown but it didn\'t');

    state.purchases = _.concat(state.purchases,
      {tokens: tokens, rate: rate, wei: weiCost, beneficiary: command.beneficiary, account: command.account}
    );
    state.lastCallTime[command.beneficiary] = nextTime;
    state.balances[command.beneficiary] = getBalance(state, command.beneficiary).plus(help.toAtto(tokens));
    state.weiRaised = state.weiRaised.plus(weiCost);
    state.tokensSold = state.tokensSold.plus(help.toAtto(tokens));
    state.crowdsaleSupply = state.crowdsaleSupply.plus(help.toAtto(tokens));
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runSendTransactionCommand(command, state) {

  let crowdsale = state.crowdsaleData,
    { startTime, endTime } = crowdsale,
    weiCost = parseInt(web3.toWei(command.eth, 'ether')),
    nextTimestamp = latestTime(),
    account = gen.getAccount(command.account),
    rate = help.getCrowdsaleExpectedRate(state, account),
    tokens = new BigNumber(command.eth).mul(rate);

  let inTGE = nextTimestamp >= startTime && nextTimestamp <= endTime,
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = (!inTGE) ||
    (inTGE && crowdsale.initialRate == 0) || //TODO: below
    (state.crowdsalePaused) ||
    (crowdsale.goal == 0) ||
    (crowdsale.cap == 0) ||
    (state.crowdsaleFinalized) ||
    (command.eth == 0) ||
    hasZeroAddress;
  try {
    // help.debug(colors.yellow('buyTokens rate:', rate, 'eth:', command.eth, 'endBlocks:', crowdsale.end1Timestamp, end2Timestamp, 'blockTimestamp:', nextTimestamp));
    await state.crowdsaleContract.sendTransaction({value: weiCost, from: account});
    assert.equal(false, shouldThrow, 'sendTransaction should have thrown but it did not');
    if (inTGE) {
      state.purchases = _.concat(state.purchases,
        {tokens: tokens, rate: rate, wei: weiCost, beneficiary: command.beneficiary, account: command.account}
      );
      state.weiRaised = state.weiRaised.plus(weiCost);
      state.tokensSold = state.tokensSold.plus(tokens);
    } else {
      throw(new Error('sendTransaction not in TGE should have thrown'));
    }

    state.crowdsaleSupply = state.crowdsaleSupply.plus(help.toAtto(tokens));

  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runAddToWhitelistCommand(command, state) {

  let { startPreTime } = state.crowdsaleData,
    nextTimestamp = latestTime(),
    account = gen.getAccount(command.fromAccount),
    whitelistedAccount = gen.getAccount(command.whitelistedAccount);

  let hasZeroAddress = _.some([account, whitelistedAccount], isZeroAddress);

  let shouldThrow = hasZeroAddress ||
    command.fromAccount != state.owner ||
    nextTimestamp > startPreTime;
  try {
    await state.crowdsaleContract.addToWhitelist(whitelistedAccount, {from: account});
    assert.equal(false, shouldThrow, 'add to whitelist should have thrown but it did not');

    state.whitelist.push(whitelistedAccount);
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runSetBuyerRateCommand(command, state) {

  let { startPreTime } = state.crowdsaleData,
    account = gen.getAccount(command.fromAccount),
    nextTimestamp = latestTime(),
    whitelistedAccount = gen.getAccount(command.whitelistedAccount),
    rate = command.rate;

  let hasZeroAddress = _.some([account, whitelistedAccount], isZeroAddress);

  let shouldThrow = hasZeroAddress ||
    rate == 0 ||
    command.fromAccount != state.owner ||
    nextTimestamp > startPreTime ||
    !_.includes(state.whitelist, whitelistedAccount);
  try {
    await state.crowdsaleContract.setBuyerRate(whitelistedAccount, rate, {from: account});
    assert.equal(false, shouldThrow, 'add to whitelist should have thrown but it did not');
    state.buyerRate[whitelistedAccount] = rate;
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runPauseCrowdsaleCommand(command, state) {
  let account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = (state.crowdsalePaused == command.pause) ||
    (command.fromAccount != state.owner) ||
    hasZeroAddress;

  help.debug(colors.yellow('pausing crowdsale, previous state:', state.crowdsalePaused, 'new state:', command.pause));
  try {
    if (command.pause) {
      await state.crowdsaleContract.pause({from: account});
    } else {
      await state.crowdsaleContract.unpause({from: account});
    }
    assert.equal(false, shouldThrow);
    state.crowdsalePaused = command.pause;
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runPauseTokenCommand(command, state) {
  let account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = (state.tokenPaused == command.pause) ||
    // (state.crowdsaleFinalized && state.tokenPaused != command.pause) ||
    !state.crowdsaleFinalized ||
    (command.fromAccount != state.owner) ||
    hasZeroAddress;

  help.debug(colors.yellow('pausing token, previous state:', state.tokenPaused, 'new state:', command.pause));

  try {
    if (command.pause) {
      await state.crowdsaleContract.pauseToken({from: account});
    } else {
      await state.crowdsaleContract.unpauseToken({from: account});
    }
    assert.equal(false, shouldThrow);
    state.tokenPaused = command.pause;
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runFinalizeCrowdsaleCommand(command, state) {

  let crowdsale = state.crowdsaleData,
    { endPreTime } = crowdsale,
    nextTimestamp = latestTime(),
    account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account);

  let preTGEDone = nextTimestamp >= endPreTime;

  let shouldThrow = state.crowdsaleFinalized ||
    state.crowdsalePaused ||
    !preTGEDone ||
    hasZeroAddress ||
    (nextTimestamp <= state.crowdsaleData.endTime);

  try {

    let goalReached = state.tokensSold.gte(state.crowdsaleData.goal);

    help.debug(colors.yellow('finishing crowdsale on block', nextTimestamp, ', from address:', gen.getAccount(command.fromAccount), ', funded:', goalReached));

    console.log('token owner before finalize', await state.token.owner());

    await state.crowdsaleContract.finalize({from: account});

    if (goalReached) {
      //TODO: CHECK CHANGE OF OWNERSHIP
      console.log('foundation wallet', state.crowdsaleData.foundationWallet);
      console.log('owner', await state.crowdsaleContract.owner());
      console.log('owner', await state.token.owner());
      // assert.equal(state.crowdsaleData.foundationWallet, await state.crowdsaleContract.owner());
      // assert.equal(state.crowdsaleData.foundationWallet, await state.token.owner());

      let foundationWallet = await state.crowdsaleContract.wallet(),
        totalSupply = new BigNumber(state.crowdsaleData.TOTAL_SUPPLY);

      totalSupply.sub(state.crowdsaleSupply).should.be.bignumber.equal(
        await state.token.balanceOf(foundationWallet)
      );

      state.vaultState = 2;
    } else {
      state.vaultState = 1;
    }
    assert.equal(false, shouldThrow);

    help.debug(colors.yellow('crowdsale finished on block', nextTimestamp, ', vault state:', state.vaultState, ', vault:', JSON.stringify(state.vault)));

    state.crowdsaleFinalized = true;
    state.goalReached = goalReached;
    state.tokenPaused = false;
    //TODO: change state.owner or token owner??
  } catch(e) {
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

  console.log('investedWei', _.sumBy(purchases, (p) => p.wei));

  try {
    let currentBalance = web3.eth.getBalance(account);

    await state.crowdsaleContract.claimRefund({from: account, gasPrice: 0});
    assert.equal(false, shouldThrow, 'claimRefund should have thrown but it did not');
    let balanceAfterClaimRefund = web3.eth.getBalance(account);
    assert.equal((balanceAfterClaimRefund.sub(currentBalance)).eq(investedWei), true);

  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runTransferCommand(command, state) {

  let fromAddress = gen.getAccount(command.fromAccount),
    toAddress = gen.getAccount(command.toAccount),
    fromBalance = getBalance(state, command.fromAccount),
    atto = help.toAtto(command.lif),
    hasZeroAddress = _.some([fromAddress], isZeroAddress),
    shouldThrow = state.tokenPaused || fromBalance.lt(atto) ||
      (hasZeroAddress &  new BigNumber(atto).gt(0));

  try {
    await state.token.transfer(toAddress, atto, {from: fromAddress});

    assert.equal(false, shouldThrow, 'transfer should have thrown but it did not');

    // TODO: take spent gas into account?
    state.balances[command.fromAccount] = fromBalance.minus(atto);
    state.balances[command.toAccount] = getBalance(state, command.toAccount).plus(atto);
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

function getAllowance(state, sender, from) {
  if (!state.allowances[sender])
    state.allowances[sender] = {};
  return state.allowances[sender][from] || new BigNumber(0);
}

function setAllowance(state, sender, from, allowance) {
  if (!state.allowances[sender])
    state.allowances[sender] = {};
  return state.allowances[sender][from] = allowance;
}

async function runApproveCommand(command, state) {

  let fromAddress = gen.getAccount(command.fromAccount),
    spenderAddress = gen.getAccount(command.spenderAccount),
    atto = help.toAtto(command.qbx),
    hasZeroAddress = _.some([fromAddress], isZeroAddress),
    shouldThrow = state.tokenPaused || (hasZeroAddress &  new BigNumber(atto).gt(0));

  try {
    await state.token.approve(spenderAddress, atto, {from: fromAddress});

    assert.equal(false, shouldThrow, 'approve should have thrown but it did not');

    // TODO: take spent gas into account?
    setAllowance(state, command.fromAccount, command.spenderAccount, atto);
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runTransferFromCommand(command, state) {

  let senderAddress = gen.getAccount(command.senderAccount),
    fromAddress = gen.getAccount(command.fromAccount),
    toAddress = gen.getAccount(command.toAccount),
    fromBalance = getBalance(state, command.fromAccount),
    atto = help.toAtto(command.lif),
    allowance = getAllowance(state, command.senderAccount, command.fromAccount),
    hasZeroAddress = _.some([fromAddress], isZeroAddress);

  let shouldThrow = state.tokenPaused ||
    fromBalance.lt(atto) ||
    (isZeroAddress(senderAddress) & new BigNumber(atto).gt(0)) ||
    hasZeroAddress ||
    (allowance < atto);

  try {
    await state.token.transferFrom(senderAddress, toAddress, atto, {from: fromAddress});

    assert.equal(false, shouldThrow, 'transferFrom should have thrown but it did not');

    // TODO: take spent gas into account?
    state.balances[command.fromAccount] = fromBalance.minus(atto);
    state.balances[command.toAccount] = getBalance(state, command.toAccount).plus(atto);
    setAllowance(state, command.senderAccount, command.fromAccount, allowance.minus(atto));
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runBurnTokensCommand(command, state) {
  let account = gen.getAccount(command.account),
    balance = getBalance(state, command.account),
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = state.tokenPaused ||
    (balance < command.tokens) ||
    hasZeroAddress;

  try {
    await state.token.burn(command.tokens, {from: account});
    assert.equal(false, shouldThrow, 'burn should have thrown but it did not');

    state.balances[account] = balance.minus(command.tokens);
    state.totalSupply = state.totalSupply.minus(command.tokens);

  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runFundCrowdsaleBelowSoftCap(command, state) {

  if (!state.crowdsaleFinalized) {
    // unpause the crowdsale if needed
    if (state.crowdsalePaused) {
      state = await runPauseCrowdsaleCommand({pause: false, fromAccount: state.owner}, state);
    }

    let goal = await state.crowdsaleData.goal,
      tokensSold = state.tokensSold,
      from = command.account;

    if (goal > tokensSold) {
      // wait for crowdsale startTime
      if (latestTime() < state.crowdsaleData.startTime) {
        await increaseTimeTestRPCTo(state.crowdsaleData.startTime);
      }

      // buy enough tokens to exactly reach the minCap (which is less than softCap)
      let tokens = goal.minus(tokensSold),
        ethAmount = help.fromAtto(tokens).div(help.getCrowdsaleExpectedRate(state, from)),
        buyTokensCommand = {account: command.account, eth: ethAmount, beneficiary: command.account};

      state = await runBuyTokensCommand(buyTokensCommand, state);
    }

    goal.should.be.bignumber.equal(new BigNumber(state.tokensSold));

    if (command.finalize) {
      // wait for crowdsale endTime
      if (latestTime() < state.crowdsaleData.endTime) {
        await increaseTimeTestRPCTo(state.crowdsaleData.endTime + 1);
      }

      state = await runFinalizeCrowdsaleCommand({fromAccount: command.account}, state);

      // verify that the crowdsale is finalized and funded
      assert.equal(true, state.crowdsaleFinalized);
      assert.equal(true, state.goalReached);
    }
  }

  return state;
}


const commands = {
  waitTime: {gen: gen.waitTimeCommandGen, run: runWaitTimeCommand},
  checkRate: {gen: gen.checkRateCommandGen, run: runCheckRateCommand},
  setWallet: {gen: gen.setWalletCommandGen, run: runSetWalletCommand},
  sendTransaction: {gen: gen.sendTransactionCommandGen, run: runSendTransactionCommand},
  buyTokens: {gen: gen.buyTokensCommandGen, run: runBuyTokensCommand},
  burnTokens: {gen: gen.burnTokensCommandGen, run: runBurnTokensCommand},
  pauseCrowdsale: {gen: gen.pauseCrowdsaleCommandGen, run: runPauseCrowdsaleCommand},
  pauseToken: {gen: gen.pauseTokenCommandGen, run: runPauseTokenCommand},
  finalizeCrowdsale: {gen: gen.finalizeCrowdsaleCommandGen, run: runFinalizeCrowdsaleCommand},
  claimRefund: {gen: gen.claimRefundCommandGen, run: runClaimRefundCommand},
  transfer: {gen: gen.transferCommandGen, run: runTransferCommand},
  approve: {gen: gen.approveCommandGen, run: runApproveCommand},
  transferFrom: {gen: gen.transferFromCommandGen, run: runTransferFromCommand},
  fundCrowdsaleBelowSoftCap: {gen: gen.fundCrowdsaleBelowSoftCap, run: runFundCrowdsaleBelowSoftCap},
  addToWhitelist: { gen: gen.addToWhitelistGen, run: runAddToWhitelistCommand},
  setBuyerRate: { gen: gen.setBuyerRateGen, run: runSetBuyerRateCommand},
};

module.exports = {
  commands: commands,

  commandsGen: jsc.oneof(_.map(commands, (c) => c.gen)),

  findCommand: (type) => {
    let command = commands[type];
    if (command === undefined)
      throw(new Error('unknown command ' + type));
    return command;
  },

  ExceptionRunningCommand: ExceptionRunningCommand
};
