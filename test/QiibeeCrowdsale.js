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
    cap: new BigNumber(help.toWei(1800)),
    minInvest: new BigNumber(help.toWei(100)),
    maxCumulativeInvest: new BigNumber(help.toWei(500)),
    maxGasPrice: new BigNumber(5000000000000000000),
    token: '0x1234556789',
    wallet: wallet
  };

  async function createCrowdsale(params) {
    const startTime = params.start === undefined ? (latestTime() + defaultTimeDelta) : params.start,
      endTime = params.endTime === undefined ? (startTime + duration.weeks(1)) : params.endTime,
      rate = params.rate === undefined ? defaults.rate : params.rate,
      cap = params.cap === undefined ? defaults.cap : params.cap,
      minInvest = params.minInvest === undefined ? defaults.minInvest : params.minInvest,
      maxCumulativeInvest = params.maxCumulativeInvest === undefined ? defaults.maxCumulativeInvest : params.maxCumulativeInvest,
      maxGasPrice = params.maxGasPrice === undefined ? defaults.maxGasPrice : params.maxGasPrice,
      token = params.token === undefined ? defaults.token : params.token,
      wallet = params.wallet === undefined ? defaults.wallet : params.foundationWallet;

    return await QiibeeCrowdsale.new(startTime, endTime, rate, cap, minInvest, maxCumulativeInvest, maxGasPrice, token, wallet, {from: owner});
  }

  it('can create a qiibee crowdsale', async function () {
    await createCrowdsale({});
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

  it('should fail creating qiibee crowdsale with zero maxCumulativeInvest', async function () {
    try {
      await createCrowdsale({maxCumulativeInvest: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee crowdsale with minInvest bigger than maxCumulativeInvest', async function () {
    try {
      await createCrowdsale({minInvest: defaults.maxCumulativeInvest.plus(100)});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee crowdsale with zero maxGasPrice', async function () {
    try {
      await createCrowdsale({maxGasPrice: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee crowdsale with no token', async function () {
    try {
      await createCrowdsale({token: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

});
