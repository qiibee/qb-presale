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

var TokenVesting = artifacts.require('./TokenVesting.sol');

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

async function runCheckRateCommand(command, state) {
  let expectedRate = help.getCrowdsaleExpectedRate(state);
  let rate = await state.crowdsaleContract.getRate();
  assert.equal(expectedRate, rate,
    'expected rate is different! Expected: ' + expectedRate + ', actual: ' + rate + '. blocks: ' + web3.eth.blockTimestamp +
    ', start/initialRate/preferentialRate: ' + state.crowdsaleData.startTime + '/' + state.crowdsaleData.rate + '/' + state.crowdsaleData.preferentialRate);
  help.debug(colors.green('Expected rate:', expectedRate, 'rate:', rate));
  return state;
}

async function runCheckTokensCommand(command, state) {
  if (command.account != 'zero') {
    let account = gen.getAccount(command.account),
      nextTime = latestTime(),
      vesting = await TokenVesting.at(await state.crowdsaleContract.vestings(account)),
      releasable = await vesting.releasableAmount(state.token.address),
      start = await vesting.start(),
      cliff = await vesting.cliff(),
      duration = await vesting.duration(),
      revoked = await vesting.revoked[state.token];

    let purchasedTokens = new BigNumber(help.toAtto(_.sumBy(_.filter(state.purchases, function(p) {
      return  p.beneficiary == command.account;
    }), function(p) {
      return parseInt(p.tokens);
    })));

    if (nextTime < cliff) {
      releasable.should.be.bignumber.equal(0);
    } else if (nextTime >= start.add(duration) || revoked) {
      releasable.should.be.bignumber.equal(purchasedTokens);
    } else {
      let cs = new BigNumber(nextTime - start);
      purchasedTokens.mul(cs).div(duration).should.be.bignumber.gte(releasable);
    }
  }
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
    rate = help.getCrowdsaleExpectedRate(state, account, weiCost),
    tokens = new BigNumber(command.eth).mul(rate),
    hasZeroAddress = _.some([account, beneficiaryAccount], isZeroAddress),
    newBalance = getBalance(state, command.beneficiary).plus(help.toAtto(tokens));

  let inTGE = nextTime >= startTime && nextTime <= endTime,
    capExceeded = state.tokensSold.plus(help.toAtto(tokens)).gt(crowdsale.cap),
    gasExceeded = (command.gasPrice > state.crowdsaleData.maxGasPrice) && inTGE,
    frequencyExceeded = state.lastCallTime[command.account] && ((nextTime - state.lastCallTime[command.account]) < state.crowdsaleData.maxCallFrequency),
    maxExceeded = newBalance.gt(state.crowdsaleData.maxInvest),
    minNotReached = help.toAtto(tokens).lt(state.crowdsaleData.minInvest);

  let shouldThrow = (!inTGE) ||
    (state.crowdsalePaused) ||
    //TODO: add reuqirements for TOTAL SUPPLY, FOUNDATION, etc
    crowdsale.rate == 0 ||
    crowdsale.goal == 0 ||
    crowdsale.cap == 0 ||
    crowdsale.minInvest == 0 ||
    crowdsale.maxInvest == 0 ||
    crowdsale.minInvest > state.maxInvest ||
    state.crowdsaleFinalized ||
    hasZeroAddress ||
    weiCost == 0 ||
    maxExceeded ||
    minNotReached ||
    frequencyExceeded ||
    gasExceeded ||
    capExceeded;

  try {
    //await state.crowdsaleContract.buyTokens(beneficiaryAccount, {value: weiCost, from: account});
    //gasPrice price (in ether) of one unit of gas specified in the transaction
    const tx = await state.crowdsaleContract.buyTokens(beneficiaryAccount, {value: weiCost, from: account, gasPrice: (command.gasPrice ? command.gasPrice : state.crowdsaleData.maxGasPrice)});
    assert.equal(false, shouldThrow, 'buyTokens should have thrown but it didn\'t');

    help.debug(colors.green('SUCCESS buying tokens, rate:', rate, 'eth:', command.eth, 'endBlocks:', crowdsale.endTime, 'blockTimestamp:', nextTime));

    state.purchases = _.concat(state.purchases,
      {tokens: tokens, rate: rate, wei: weiCost, beneficiary: command.beneficiary, account: command.account}
    );
    state.lastCallTime[command.account] = nextTime;
    state.balances[command.beneficiary] = getBalance(state, command.beneficiary).plus(help.toAtto(tokens));
    state.weiRaised = state.weiRaised.plus(weiCost);
    state.tokensSold = state.tokensSold.plus(help.toAtto(tokens));
    state.crowdsaleSupply = state.crowdsaleSupply.plus(help.toAtto(tokens));

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
    rate = help.getCrowdsaleExpectedRate(state, account, weiCost),
    tokens = new BigNumber(command.eth).mul(rate),
    hasZeroAddress = _.some([account, beneficiaryAccount], isZeroAddress),
    newBalance = getBalance(state, command.beneficiary).plus(help.toAtto(tokens));

  let inTGE = nextTime >= startTime && nextTime <= endTime,
    capExceeded = state.tokensSold.plus(help.toAtto(tokens)).gt(crowdsale.cap),
    gasExceeded = (command.gasPrice > state.crowdsaleData.maxGasPrice) && inTGE,
    frequencyExceeded = state.lastCallTime[command.account] && ((nextTime - state.lastCallTime[command.account]) < state.crowdsaleData.maxCallFrequency) && inTGE, //TODO: account or beneficiary?
    maxExceeded = newBalance.gt(state.crowdsaleData.maxInvest) && inTGE,
    minNotReached = help.toAtto(tokens).lt(state.crowdsaleData.minInvest) && inTGE;

  let shouldThrow = (!inTGE) ||
    state.crowdsalePaused ||
    //TODO: add reuqirements for TOTAL SUPPLY, FOUNDATION, etc
    crowdsale.rate == 0 ||
    crowdsale.goal == 0 ||
    crowdsale.cap == 0 ||
    crowdsale.minInvest == 0 ||
    crowdsale.maxInvest == 0 ||
    crowdsale.minInvest > state.maxInvest ||
    state.crowdsaleFinalized ||
    hasZeroAddress ||
    weiCost == 0 ||
    maxExceeded ||
    minNotReached ||
    frequencyExceeded ||
    gasExceeded ||
    capExceeded;

  try {
    // help.debug(colors.green('buyTokens rate:', rate, 'eth:', command.eth, 'endBlocks:', crowdsale.end1Timestamp, end2Timestamp, 'blockTimestamp:', nextTimestamp));
    const tx = await state.crowdsaleContract.sendTransaction({value: weiCost, from: account});
    help.debug(colors.green('SUCCESS sending transaction'));

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

    state = decreaseEthBalance(state, command.account, weiCost);
    state = decreaseEthBalance(state, command.account, help.txGasCost(tx));
  } catch(e) {
    help.debug(colors.yellow('FAILURE sending transaction, gasExceeded:', gasExceeded, ', minNotReached:', minNotReached, ', maxExceeded:', maxExceeded, ', frequencyExceeded:', frequencyExceeded, ', capExceeded: ', capExceeded));
    state = trackGasFromLastBlock(state, command.account);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runPresaleSendTransactionCommand(command, state) {
  let  weiCost = web3.toWei(new BigNumber(command.eth), 'ether'),
    account = gen.getAccount(command.account);

  let hasZeroAddress = isZeroAddress(account),
    isWhitelisted = _.includes(state.whitelist, account),
    capExceeded = state.weiRaised.plus(weiCost).gt(state.presaleData.cap);

  let shouldThrow = (state.crowdsalePaused) ||
    (command.eth == 0) ||
    (!isWhitelisted) ||
    capExceeded ||
    hasZeroAddress;

  try {
    // help.debug('buyTokens rate:', rate, 'eth:', command.eth, 'endBlocks:', crowdsale.end1Timestamp, end2Timestamp, 'blockTimestamp:', nextTimestamp);
    const tx = await state.crowdsaleContract.sendTransaction({value: weiCost, from: account});
    assert.equal(false, shouldThrow, 'sendTransaction should have thrown but it did not');
    if (!state.crowdsalePaused) {
      state.purchases = _.concat(state.purchases, {wei: weiCost, account: command.account});
      state.weiRaised = state.weiRaised.plus(weiCost);
    } else {
      throw(new Error('sendTransaction should have thrown because presale is paused'));
    }
    state = decreaseEthBalance(state, command.account, weiCost);
    state = decreaseEthBalance(state, command.account, help.txGasCost(tx));
  } catch(e) {
    state = trackGasFromLastBlock(state, command.account);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

async function runAddToWhitelistCommand(command, state) {
  let account = gen.getAccount(command.fromAccount),
    whitelistedAccount = gen.getAccount(command.whitelistedAccount);

  let hasZeroAddress = _.some([account, whitelistedAccount], isZeroAddress);

  let shouldThrow = hasZeroAddress ||
    command.fromAccount != state.owner;
  try {
    await state.crowdsaleContract.addToWhitelist(whitelistedAccount, {from: account});
    assert.equal(false, shouldThrow, 'add to whitelist should have thrown but it did not');

    state.whitelist.push(whitelistedAccount);
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
    hasZeroAddress = isZeroAddress(account);

  let shouldThrow = state.crowdsaleFinalized ||
    state.crowdsalePaused ||
    hasZeroAddress ||
    nextTimestamp <= state.crowdsaleData.endTime;

  try {

    let goalReached = state.tokensSold.gte(state.crowdsaleData.goal),
      tokenOwnerBeforeFinalize = await state.token.owner(),
      tx = await state.crowdsaleContract.finalize({from: account});

    help.debug(colors.green('SUCCESS: finishing crowdsale on block', nextTimestamp, ', from address:', gen.getAccount(command.fromAccount), ', funded:', goalReached, 'gas used: ', tx.receipt.gasUsed));

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
      assert.equal(state.crowdsaleData.foundationWallet, tokenOwnerAfterFinalize);

      let foundationWallet = await state.crowdsaleContract.wallet(),
        totalSupply = new BigNumber(state.crowdsaleData.TOTAL_SUPPLY);

      if (state.crowdsaleData.foundationWallet == account) {
        totalSupply.should.be.bignumber.equal(
          await state.token.balanceOf(foundationWallet)
        );
      } else {
        totalSupply.sub(state.crowdsaleSupply).should.be.bignumber.equal(
          await state.token.balanceOf(foundationWallet)
        );
      }
      state.vaultState = 2;
    } else {
      state.vaultState = 1;
    }
    assert.equal(false, shouldThrow);

    let states = ['ACTIVE', 'REFUNDING', 'CLOSED'];
    help.debug(colors.green('VAULT state:', states[state.vaultState], ', info:', JSON.stringify(state.vault)));

    state.crowdsaleFinalized = true;
    state.goalReached = goalReached;
    state.tokenPaused = false;
    state.tokenOwner = state.wallet; //TODO: change state.owner or token owner??
  } catch(e) {
    help.debug(colors.yellow('FAILURE finishing crowdsale, on block', nextTimestamp, ', from address:', gen.getAccount(command.fromAccount), ', funded:'));
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
    balance = getBalance(state, command.account),
    hasZeroAddress = isZeroAddress(account),
    atto = help.toAtto(command.tokens);

  let shouldThrow = state.tokenPaused ||
    (balance < command.tokens) ||
    command.tokens == 0 ||
    hasZeroAddress;

  try {
    const tx = await state.token.burn(atto, {from: account});
    assert.equal(false, shouldThrow, 'burn should have thrown but it did not');
    help.debug(colors.green('SUCCESS burning tokens, balance:', balance, 'tokens: ', command.tokens));

    state.balances[account] = balance.minus(atto);
    state.totalSupply = state.totalSupply.minus(atto);

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
      cap = state.crowdsaleData.cap,
      tokensSold = state.tokensSold,
      from = command.account;

    if (goal.gte(tokensSold)) {
      // wait for crowdsale startTime
      if (latestTime() < state.crowdsaleData.startTime) {
        await increaseTimeTestRPCTo(state.crowdsaleData.startTime);
      }

      // buy enough tokens to be over the goal
      let leftToGoal = goal.minus(tokensSold),
        tokens = leftToGoal.plus(cap.minus(goal).mul(0.10)),
        ethAmount = Math.floor(help.fromAtto(tokens).div(help.getCrowdsaleExpectedRate(state, from))),
        buyTokensCommand = {account: command.account, eth: ethAmount, beneficiary: command.account};

      state = await runBuyTokensCommand(buyTokensCommand, state);
    }

    new BigNumber(state.tokensSold).should.be.bignumber.gte(goal);

    if (command.finalize) {
      // wait for crowdsale endTime
      if (latestTime() < state.crowdsaleData.endTime) {
        await increaseTimeTestRPCTo(state.crowdsaleData.endTime + 1);
      }
      state = await runFinalizeCrowdsaleCommand({fromAccount: from}, state);
      // verify that the crowdsale is finalized and funded
      assert.equal(true, state.crowdsaleFinalized);
      assert.equal(true, state.goalReached);

    }
  }

  return state;
}

async function runAddPresalePaymentCommand(command, state) {

  let { startTime } = state.crowdsaleData,
    nextTimestamp = latestTime(),
    weiToSend = web3.toWei(command.eth, 'ether'),
    tokens = weiToSend * command.rate,
    account = gen.getAccount(command.fromAccount),
    beneficiary = gen.getAccount(command.beneficiaryAccount),
    hasZeroAddress = _.some([account, beneficiary], isZeroAddress),
    cliff = command.cliff,
    duration = command.duration;

  let shouldThrow = (nextTimestamp >= startTime) ||
    (state.crowdsalePaused) ||
    (account != gen.getAccount(state.owner)) ||
    (state.crowdsaleFinalized) ||
    hasZeroAddress ||
    (weiToSend == 0) ||
    (command.rate <= state.crowdsaleData.rate) ||
    command.rate == 0 ||
    command.rate <= state.crowdsaleData.rate ||
    cliff == 0 || duration == 0 || duration < cliff;

  try {
    const tx = await state.crowdsaleContract.addPresaleTokens(beneficiary, weiToSend, command.rate, cliff, duration, {from: account});
    assert.equal(false, shouldThrow, 'addPresalePayment should have thrown but it did not');
    help.debug(colors.green('SUCCESS adding presale private tokens for account:', command.beneficiaryAccount, 'eth:', command.eth, 'fromAccount:', command.fromAccount, 'blockTimestamp:', nextTimestamp));

    state.tokensSold = state.tokensSold.plus(tokens);
    state.crowdsaleSupply = state.crowdsaleSupply.plus(tokens);
    state.purchases = _.concat(state.purchases,
      {tokens: help.fromAtto(tokens), rate: command.rate, wei: weiToSend, beneficiary: command.beneficiaryAccount, account: command.fromAccount}
    );
    state = decreaseEthBalance(state, command.fromAccount, help.txGasCost(tx));
  } catch(e) {
    help.debug(colors.yellow('FAILED adding presale private tokens for account:', command.beneficiaryAccount, 'eth:', command.eth, 'fromAccount:', command.fromAccount, 'blockTimestamp:', nextTimestamp));
    state = trackGasFromLastBlock(state, command.fromAccount);
    assertExpectedException(e, shouldThrow, hasZeroAddress, state, command);
  }
  return state;
}

const crowdsaleCommands = {
  waitTime: {gen: gen.waitTimeCommandGen, run: runWaitTimeCommand},
  checkRate: {gen: gen.checkRateCommandGen, run: runCheckRateCommand},
  checkTokens: {gen: gen.checkTokensCommandGen, run: runCheckTokensCommand},
  setWallet: {gen: gen.setWalletCommandGen, run: runSetWalletCommand},
  buyTokens: {gen: gen.buyTokensCommandGen, run: runBuyTokensCommand},
  burnTokens: {gen: gen.burnTokensCommandGen, run: runBurnTokensCommand},
  sendTransaction: {gen: gen.sendTransactionCommandGen, run: runSendTransactionCommand},
  pauseCrowdsale: {gen: gen.pauseCrowdsaleCommandGen, run: runPauseCrowdsaleCommand},
  pauseToken: {gen: gen.pauseTokenCommandGen, run: runPauseTokenCommand},
  finalizeCrowdsale: {gen: gen.finalizeCrowdsaleCommandGen, run: runFinalizeCrowdsaleCommand},
  claimRefund: {gen: gen.claimRefundCommandGen, run: runClaimRefundCommand},
  fundCrowdsaleBelowCap: {gen: gen.fundCrowdsaleBelowCapCommandGen, run: runFundCrowdsaleBelowCap},
  addPresalePayment: {gen: gen.addPresalePaymentCommandGen, run: runAddPresalePaymentCommand},
};

const presaleCommands = {
  presaleSendTransaction: {gen: gen.presaleSendTransactionCommandGen, run: runPresaleSendTransactionCommand},
  pauseCrowdsale: {gen: gen.pauseCrowdsaleCommandGen, run: runPauseCrowdsaleCommand},
  addToWhitelist: { gen: gen.addToWhitelistCommandGen, run: runAddToWhitelistCommand},
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
