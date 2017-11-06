/*
 * This are tests taken from RefundableCrowdsale.sol, CappedCrowdsale.sol from Open Zeppelin
 * and adapted to the Crowdsale.
 */

const QiibeeCrowdsale = artifacts.require('QiibeeCrowdsale.sol');
const QiibeeToken = artifacts.require('QiibeeToken.sol');

const latestTime = require('../helpers/latestTime');
const { increaseTimeTestRPC } = require('../helpers/increaseTime');
const { duration } = require('../helpers/increaseTime');
const help = require('../helpers.js');
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

const LOG_EVENTS = false;

contract('QiibeeCrowdsale', function ([owner, wallet, investor]) {

  const rate = 6000;
  const goal = new BigNumber(help.toWei(800));
  const cap = new BigNumber(help.toWei(1800));
  const minInvest = new BigNumber(help.toWei(100));
  const maxInvest = new BigNumber(help.toWei(500));
  const maxGasPrice = new BigNumber(5000000000000000000);
  const maxCallFrequency = 600;

  let startTime, endTime;
  let eventsWatcher, token, crowdsale;

  beforeEach(async function () {
    startTime = latestTime() + duration.weeks(1);
    endTime = startTime + duration.weeks(1);

    crowdsale = await QiibeeCrowdsale.new(startTime, endTime, rate, goal, cap, minInvest, maxInvest, maxGasPrice, maxCallFrequency, wallet, {from: owner});

    token = QiibeeToken.at(await crowdsale.token());
    await increaseTimeTestRPC(1);

    assert.equal(startTime, parseInt(await crowdsale.startTime()));
    assert.equal(endTime, parseInt(await crowdsale.endTime()));

    assert.equal(goal.toString(), (await crowdsale.goal()).toString());
    assert.equal(cap.toString(), (await crowdsale.cap()).toString());
    assert.equal(minInvest.toString(), (await crowdsale.minInvest()).toString());
    assert.equal(maxInvest.toString(), (await crowdsale.maxInvest()).toString());
    assert.equal(maxGasPrice, parseInt(await crowdsale.maxGasPrice()));
    assert.equal(maxCallFrequency, parseInt(await crowdsale.maxCallFrequency()));
    assert.equal(wallet, await crowdsale.wallet());

    eventsWatcher = token.allEvents();

    eventsWatcher.watch(function(error, log){
      if (LOG_EVENTS)
        console.log('Event:', log.event, ':',log.args);
    });
  });

  afterEach(function(done) {
    eventsWatcher.stopWatching();
    done();
  });

  it('should fail creating qiibee crowdsale with zero rate', async function () {
    try {
      await QiibeeCrowdsale.new(startTime, endTime, 0, goal, cap, minInvest, maxInvest, maxGasPrice, maxCallFrequency, wallet, {from: owner});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee crowdsale with zero minInvest', async function () {
    try {
      await QiibeeCrowdsale.new(startTime, endTime, rate, goal, cap, 0, maxInvest, maxGasPrice, maxCallFrequency, wallet, {from: owner});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee crowdsale with zero maxInvest', async function () {
    try {
      await QiibeeCrowdsale.new(startTime, endTime, rate, goal, cap, minInvest, 0, maxGasPrice, maxCallFrequency, wallet, {from: owner});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee crowdsale with minInvest bigger than maxInvest', async function () {
    try {
      await QiibeeCrowdsale.new(startTime, endTime, rate, goal, cap, maxInvest.plus(100), maxInvest, maxGasPrice, maxCallFrequency, wallet, {from: owner});
    } catch (e) {
      assertExpectedException(e);
    }
  });
});
