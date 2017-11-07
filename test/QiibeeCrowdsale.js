/*
 * This are tests taken from RefundableCrowdsale.sol, CappedCrowdsale.sol from Open Zeppelin
 * and adapted to the Crowdsale.
 */

const QiibeeCrowdsale = artifacts.require('QiibeeCrowdsale.sol');

const latestTime = require('./helpers/latestTime');
const { duration } = require('./helpers/increaseTime');
const help = require('./helpers.js');
const BigNumber = web3.BigNumber;

require('chai').
  use(require('chai-bignumber')(BigNumber)).
  should();

function assertExpectedException(e) {
  let isKnownException = help.isInvalidOpcodeEx(e);
  if (!isKnownException) {
    throw(e);
  }
}

contract('QiibeeCrowdsale', function ([owner, wallet]) {

  const defaultTimeDelta = duration.days(1); // time delta used in time calculations (for start, end1 & end2)
  const defaults = {
    rate: 6000,
    goal: new BigNumber(help.toWei(800)),
    cap: new BigNumber(help.toWei(1800)),
    minInvest: new BigNumber(help.toWei(100)),
    maxInvest: new BigNumber(help.toWei(500)),
    maxGasPrice: new BigNumber(5000000000000000000),
    maxCallFrequency: 600,
    wallet: wallet
  };

  async function createCrowdsale(params) {
    const startTime = params.start === undefined ? (latestTime() + defaultTimeDelta) : params.start,
      endTime = params.endTime === undefined ? (startTime + duration.weeks(1)) : params.endTime,
      rate = params.rate === undefined ? defaults.rate : params.rate,
      goal = params.goal === undefined ? defaults.goal : params.goal,
      cap = params.cap === undefined ? defaults.cap : params.cap,
      minInvest = params.minInvest === undefined ? defaults.minInvest : params.minInvest,
      maxInvest = params.maxInvest === undefined ? defaults.maxInvest : params.maxInvest,
      maxGasPrice = params.maxGasPrice === undefined ? defaults.maxGasPrice : params.maxGasPrice,
      maxCallFrequency = params.maxCallFrequency === undefined ? defaults.maxCallFrequency : params.maxCallFrequency,
      wallet = params.wallet === undefined ? defaults.wallet : params.foundationWallet;

    return await QiibeeCrowdsale.new(startTime, endTime, rate, goal, cap, minInvest, maxInvest, maxGasPrice, maxCallFrequency, wallet, {from: owner});
  }

  it('can create a qiibee crowdsale', async function () {
    try {
      await createCrowdsale({});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee crowdsale with zero rate', async function () {
    try {
      await createCrowdsale({rate: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee crowdsale with zero minInvest', async function () {
    try {
      await createCrowdsale({minInvest: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee crowdsale with zero maxInvest', async function () {
    try {
      await createCrowdsale({maxInvest: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee crowdsale with minInvest bigger than maxInvest', async function () {
    try {
      await createCrowdsale({minInvest: defaults.maxInvest.plus(100)});
    } catch (e) {
      assertExpectedException(e);
    }
  });

});
