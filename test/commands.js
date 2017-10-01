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

const priceFactor = 100000;

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

async function runCheckRateCommand(command, state) {
  let from = gen.getAccount(command.fromAccount);
  let expectedRate = help.getCrowdsaleExpectedRate(state, from);
  let rate = await state.crowdsaleContract.getRate({from: from});
  console.log("RATE",rate);
  console.log("expectedRate",expectedRate);
  assert.equal(expectedRate, rate,
    'expected rate is different! Expected: ' + expectedRate + ', actual: ' + rate + '. blocks: ' + web3.eth.blockTimestamp +
    ', start/initialRate/preferentialRate: ' + state.crowdsaleData.startTime + '/' + state.crowdsaleData.initialRate + '/' + state.crowdsaleData.preferentialRate);

  return state;
}

function getBalance(state, account) {
  return state.balances[account] || new BigNumber(0);
}

async function runBuyTokensCommand(command, state) {
  let crowdsale = state.crowdsaleData,
    { startPreTime, endPreTime, startTime, endTime} = crowdsale,
    weiCost = web3.toWei(command.eth, 'ether'),
    nextTime = latestTime(),
    account = gen.getAccount(command.account),
    beneficiaryAccount = gen.getAccount(command.beneficiary),
    rate = help.getCrowdsaleExpectedRate(state, account),
    tokens = new BigNumber(command.eth).mul(rate),
    hasZeroAddress = _.some([account, beneficiaryAccount], isZeroAddress);

  let inPreTGE = nextTime >= startPreTime && nextTime <= endPreTime;

  let capExceeded = state.tokensSold.plus(help.qbx2sqbx(tokens)).gt(crowdsale.cap);

  let shouldThrow = (inPreTGE && !state.whitelist[account]) ||
    (nextTime < startPreTime) ||
    (nextTime > endPreTime && nextTime < startTime) ||
    (nextTime > endTime) ||
    // (state.crowdsalePaused) || //TODO: remove this if we dont have a Pausable crowdsale
    //TODO: add reuqirements for TOTAL SUPPLY, FOUNDATION, etc
    (crowdsale.initialRate == 0) ||
    (crowdsale.goal == 0) ||
    (crowdsale.cap == 0) ||
    (state.crowdsaleFinalized) ||
    hasZeroAddress ||
    (command.eth == 0) || capExceeded;

  try {
    help.debug('buyTokens rate:', rate, 'eth:', command.eth, 'endBlocks:', crowdsale.endTime, 'blockTimestamp:', nextTime);
    await state.crowdsaleContract.buyTokens(beneficiaryAccount, {value: weiCost, from: account});
    assert.equal(false, shouldThrow, 'buyTokens should have thrown but it didn\'t');
    state.purchases = _.concat(state.purchases,
      {tokens: tokens, rate: rate, wei: weiCost, beneficiary: command.beneficiary, account: command.account}
    );
    state.balances[command.beneficiary] = getBalance(state, command.beneficiary).plus(help.qbx2sqbx(tokens));
    state.weiRaised = state.weiRaised.plus(weiCost);
    state.tokensSold = state.tokensSold.plus(help.qbx2sqbx(tokens));
    console.log("TOKENS SOLD", await state.crowdsaleContract.tokensSold());
    state.crowdsaleSupply = state.crowdsaleSupply.plus(help.qbx2sqbx(tokens));
  } catch(e) {
    console.log("FALLE");
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runSendTransactionCommand(command, state) {

  let crowdsale = state.crowdsaleData,
    { startTime, endTime } = crowdsale,
    weiCost = parseInt(web3.toWei(command.eth, 'ether')),
    nextTimestamp = latestTime(),
    rate = help.getCrowdsaleExpectedRate(state),
    tokens = new BigNumber(command.eth).mul(rate),
    account = gen.getAccount(command.account);

  let inTGE = nextTimestamp >= startTime && nextTimestamp <= endTime,
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = (!inTGE) ||
    (inTGE && state.initialRate == 0) || //TODO: below
    // (inTGE && state.weiPerUSDinTGE == 0) || //TODO
    // (state.crowdsalePaused) || //TODO: remove this if we dont have a Pausable crowdsale
    (state.goal == 0) ||
    (state.cap == 0) ||
    (state.crowdsaleFinalized) ||
    (command.eth == 0) ||
    hasZeroAddress;
  try {
    // help.debug('buyTokens rate:', rate, 'eth:', command.eth, 'endBlocks:', crowdsale.end1Timestamp, end2Timestamp, 'blockTimestamp:', nextTimestamp);
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

    state.crowdsaleSupply = state.crowdsaleSupply.plus(help.qbx2sqbx(tokens));

  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runAddToWhitelistCommand(command, state) {

  let crowdsale = state.crowdsaleData,
    { startPreTime, endPreTime, startTime } = crowdsale,
    nextTimestamp = latestTime(),
    account = gen.getAccount(command.fromAccount),
    whitelistedAccount = gen.getAccount(command.whitelistedAccount);

  let hasZeroAddress = _.some([account, whitelistedAccount], isZeroAddress);

  let shouldThrow = hasZeroAddress;

  try {
    await state.crowdsaleContract.addToWhitelist(whitelistedAccount, {from: account});
    assert.equal(false, shouldThrow, 'add to whitelist should have thrown but it did not');
    state.whitelist[whitelistedAccount] = true;
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

  help.debug('pausing crowdsale, previous state:', state.crowdsalePaused, 'new state:', command.pause);
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
    !state.crowdsaleFinalized ||
    (command.fromAccount != state.owner) ||
    hasZeroAddress;

  help.debug('pausing token, previous state:', state.tokenPaused, 'new state:', command.pause);
  try {
    if (command.pause) {
      await state.token.pause({from: account});
    } else {
      await state.token.unpause({from: account});
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
    { startPreTime, endPreTime, startTime } = crowdsale,
    nextTimestamp = latestTime(),
    account = gen.getAccount(command.fromAccount),
    hasZeroAddress = isZeroAddress(account);

  let preTGEDone = nextTimestamp >= endPreTime;

  let shouldThrow = state.crowdsaleFinalized ||
    // state.crowdsalePaused ||
    !preTGEDone ||
    // state.crowdsalePaused || (state.initialRate == 0) || //TODO: check
    hasZeroAddress ||
    (nextTimestamp <= state.crowdsaleData.endTime);

  try {

    let goalReached = (state.tokensSold >= state.crowdsaleData.cap);

    help.debug('finishing crowdsale on block', nextTimestamp, ', from address:', gen.getAccount(command.fromAccount), ', funded:', goalReached);

    await state.crowdsaleContract.finalize({from: account});

    let fundsRaised = state.weiRaised.div(await state.crowdsaleContract.getRate());

    if (goalReached) {

      let totalSupplyBeforeFinalize = state.crowdsaleSupply;

      //TODO: check this
      console.log("foundation wallet", state.crowdsaleData.foundationWallet);
      console.log("owner", await state.crowdsaleContract.owner());
      console.log("totalSupplyBeforeFinalize", totalSupplyBeforeFinalize);

      //TODO: CHECK CHANGE OF OWNERSHIP
      // assert.equal(state.crowdsaleData.foundationWallet, await state.crowdsaleContract.owner());
      // assert.equal(state.crowdsaleData.foundationWallet, await vestedPaymentFoundation.owner());

      //TODO: CHECK TOKENS IN FOUNDATION WALLET ARE THE CORRESPONDING ONES
      // totalSupplyBeforeFinalize.mul(0.128).floor().should.be.bignumber.equal(
      //   await state.token.balanceOf(vestedPaymentFounders.address)
      // );

      // totalSupplyBeforeFinalize.mul(0.05).floor().should.be.bignumber.equal(
      //   await state.token.balanceOf(vestedPaymentFoundation.address)
      // );

      // add founders, team and foundation long-term reserve to the totalSupply
      // in separate steps to round after each of them, exactly as in the contract
      // let foundersVestingTokens = state.totalSupply.mul(0.128).floor(),
      //   longTermReserve = state.totalSupply.mul(0.05).floor(),
      //   teamTokens = state.totalSupply.mul(0.072).floor();

      //TODO: SET NEW TOTAL SUPPLY
      // state.totalSupply = state.totalSupply.plus(foundersVestingTokens).
      //   plus(longTermReserve).plus(teamTokens);
    }
    assert.equal(false, shouldThrow);
    state.crowdsaleFinalized = true;
    state.goalReached = goalReached;
    state.tokenPaused = false;
    state.revaultState = 0;
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runAddPrivatePresalePaymentCommand(command, state) {

  let { publicPresaleStartTimestamp } = state.crowdsaleData,
    nextTimestamp = latestTime(),
    weiToSend = web3.toWei(command.eth, 'ether'),
    account = gen.getAccount(command.fromAccount),
    beneficiary = gen.getAccount(command.beneficiaryAccount),
    hasZeroAddress = _.some([account, beneficiary], isZeroAddress);

  let shouldThrow = (nextTimestamp >= publicPresaleStartTimestamp) ||
    (state.crowdsalePaused) ||
    (account != gen.getAccount(state.owner)) ||
    (state.crowdsaleFinalized) ||
    hasZeroAddress ||
    (weiToSend == 0);

  try {
    help.debug('Adding presale private tokens for account:', command.beneficiaryAccount, 'eth:', command.eth, 'fromAccount:', command.fromAccount, 'blockTimestamp:', nextTimestamp);

    await state.crowdsaleContract.addPrivatePresaleTokens(beneficiary, weiToSend, {from: account});

    assert.equal(false, shouldThrow, 'buyTokens should have thrown but it did not');

    state.totalPresaleWei = state.totalPresaleWei.plus(weiToSend);
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runClaimEthCommand(command, state) {

  let account = gen.getAccount(command.fromAccount),
    purchases = _.filter(state.purchases, (p) => p.account == command.fromAccount),
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = !state.crowdsaleFinalized ||
    !state.goalReached ||
    (purchases.length == 0) ||
    hasZeroAddress ||
    state.claimedEth[command.account] > 0;

  try {
    await state.crowdsaleContract.claimEth({from: account});

    assert.equal(false, shouldThrow, 'claimEth should have thrown but it did not');

    state.claimedEth[command.account] = _.sumBy(purchases, (p) => p.amount);
  } catch(e) {
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runTransferCommand(command, state) {

  let fromAddress = gen.getAccount(command.fromAccount),
    toAddress = gen.getAccount(command.toAccount),
    fromBalance = getBalance(state, command.fromAccount),
    lifWei = help.qbx2sqbx(command.lif),
    hasZeroAddress = _.some([fromAddress], isZeroAddress),
    shouldThrow = state.tokenPaused || fromBalance.lt(lifWei) ||
      (hasZeroAddress &  new BigNumber(lifWei).gt(0));

  try {
    await state.token.transfer(toAddress, lifWei, {from: fromAddress});

    assert.equal(false, shouldThrow, 'transfer should have thrown but it did not');

    // TODO: take spent gas into account?
    state.balances[command.fromAccount] = fromBalance.minus(lifWei);
    state.balances[command.toAccount] = getBalance(state, command.toAccount).plus(lifWei);
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
    lifWei = help.qbx2sqbx(command.lif),
    hasZeroAddress = _.some([fromAddress], isZeroAddress),
    shouldThrow = state.tokenPaused || (hasZeroAddress &  new BigNumber(lifWei).gt(0));

  try {
    await state.token.approve(spenderAddress, lifWei, {from: fromAddress});

    assert.equal(false, shouldThrow, 'approve should have thrown but it did not');

    // TODO: take spent gas into account?
    setAllowance(state, command.fromAccount, command.spenderAccount, lifWei);
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
    lifWei = help.qbx2sqbx(command.lif),
    allowance = getAllowance(state, command.senderAccount, command.fromAccount),
    hasZeroAddress = _.some([fromAddress], isZeroAddress);

  let shouldThrow = state.tokenPaused ||
    fromBalance.lt(lifWei) ||
    (isZeroAddress(senderAddress) & new BigNumber(lifWei).gt(0)) ||
    hasZeroAddress ||
    (allowance < lifWei);

  try {
    await state.token.transferFrom(senderAddress, toAddress, lifWei, {from: fromAddress});

    assert.equal(false, shouldThrow, 'transferFrom should have thrown but it did not');

    // TODO: take spent gas into account?
    state.balances[command.fromAccount] = fromBalance.minus(lifWei);
    state.balances[command.toAccount] = getBalance(state, command.toAccount).plus(lifWei);
    setAllowance(state, command.senderAccount, command.fromAccount, allowance.minus(lifWei));
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

//
// Market Maker commands
//

let getMMMaxClaimableWei = function(state) {
  if (state.MVMMonth >= state.MVMPeriods) {
    help.debug('calculating maxClaimableEth with', state.MVMStartingBalance,
      state.MVMClaimedWei,
      state.returnedWeiForBurnedTokens);
    return state.MVMStartingBalance.
      minus(state.MVMClaimedWei).
      minus(state.returnedWeiForBurnedTokens);
  } else {
    const maxClaimable = state.MVMStartingBalance.
      mul(state.claimablePercentage).dividedBy(priceFactor).
      mul(state.initialTokenSupply - state.MVMBurnedTokens).
      dividedBy(state.initialTokenSupply).
      minus(state.MVMClaimedWei);
    return _.max([0, maxClaimable]);
  }
};

async function runFundCrowdsaleBelowSoftCap(command, state) {
  if (!state.crowdsaleFinalized) {
    // unpause the crowdsale if needed //TODO: add this if we do a pausable crowdsale
    // if (state.crowdsalePaused) {
    //   state = await runPauseCrowdsaleCommand({pause: false, fromAccount: state.owner}, state);
    // }

    let goal = await state.crowdsaleContract.goal.call(),
      tokensSold = state.tokensSold;

    if (goal > tokensSold) {
      // wait for crowdsale startTime
      if (latestTime() < state.crowdsaleData.startTime) {
        await increaseTimeTestRPCTo(state.crowdsaleData.startTime);
      }

      // buy enough tokens to exactly reach the minCap (which is less than softCap)
      let tokens = goal.minus(tokensSold),
        ethAmount = help.sqbx2qbx(tokens).div(help.getCrowdsaleExpectedRate(state)),
        // ethAmount = help.sqbx2qbx(tokens).div(state.crowdsaleData.getRate()), //TODO: CHECK IF RATE HAS TO BE CALLED TO THE HELPER OR TO THE CONTRACT
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

      // verify that the crowdsale is finalized and funded, but there's no MVM
      assert.equal(true, state.crowdsaleFinalized);
      assert.equal(true, state.goalReached);
      assert(state.MVM === undefined);
    }
  }

  return state;
}


const commands = {
  waitTime: {gen: gen.waitTimeCommandGen, run: runWaitTimeCommand},
  checkRate: {gen: gen.checkRateCommandGen, run: runCheckRateCommand},
  sendTransaction: {gen: gen.sendTransactionCommandGen, run: runSendTransactionCommand},
  buyTokens: {gen: gen.buyTokensCommandGen, run: runBuyTokensCommand},
  burnTokens: {gen: gen.burnTokensCommandGen, run: runBurnTokensCommand},
  pauseCrowdsale: {gen: gen.pauseCrowdsaleCommandGen, run: runPauseCrowdsaleCommand},
  pauseToken: {gen: gen.pauseTokenCommandGen, run: runPauseTokenCommand},
  finalizeCrowdsale: {gen: gen.finalizeCrowdsaleCommandGen, run: runFinalizeCrowdsaleCommand},
  addPrivatePresalePayment: {gen: gen.addPrivatePresalePaymentCommandGen, run: runAddPrivatePresalePaymentCommand},
  claimEth: {gen: gen.claimEthCommandGen, run: runClaimEthCommand},
  transfer: {gen: gen.transferCommandGen, run: runTransferCommand},
  approve: {gen: gen.approveCommandGen, run: runApproveCommand},
  transferFrom: {gen: gen.transferFromCommandGen, run: runTransferFromCommand},
  fundCrowdsaleBelowSoftCap: {gen: gen.fundCrowdsaleBelowSoftCap, run: runFundCrowdsaleBelowSoftCap},
  addToWhitelist: { gen: gen.addToWhitelistGen, run: runAddToWhitelistCommand},
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
