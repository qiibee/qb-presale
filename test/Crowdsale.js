/*
 * This are tests taken from RefundableCrowdsale.sol, CappedCrowdsale.sol from Open Zeppelin
 * and adapted to the Crowdsale.
 */

const Crowdsale = artifacts.require('Crowdsale.sol');
const QiibeeToken = artifacts.require('QiibeeToken.sol');

const latestTime = require('./helpers/latestTime');
const {increaseTimeTestRPC, increaseTimeTestRPCTo} = require('./helpers/increaseTime');
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

const LOG_EVENTS = false;
const value = help.toWei(1);

contract('Crowdsale', function ([owner, wallet, investor]) {

  const goal = new BigNumber(help.toWei(800));
  const lessThanGoal = new BigNumber(help.toWei(750));
  const cap = new BigNumber(help.toWei(1800));
  const lessThanCap = new BigNumber(help.toWei(1000));
  const maxGasPrice = new BigNumber(5000000000000000000);
  const maxCallFrequency = 0;

  let startTime, endTime;
  let eventsWatcher, token, afterEndTime, crowdsale;

  beforeEach(async function () {
    startTime = latestTime() + duration.weeks(1);
    endTime = startTime + duration.weeks(1);
    afterEndTime = endTime + duration.seconds(1);

    crowdsale = await Crowdsale.new(startTime, endTime, goal, cap, maxGasPrice, maxCallFrequency, wallet, {from: owner});
    token = QiibeeToken.at(await crowdsale.token());
    await increaseTimeTestRPC(1);

    assert.equal(startTime, parseInt(await crowdsale.startTime()));
    assert.equal(endTime, parseInt(await crowdsale.endTime()));
    assert.equal(maxGasPrice, parseInt(await crowdsale.maxGasPrice()));
    assert.equal(maxCallFrequency, parseInt(await crowdsale.maxCallFrequency()));
    assert.equal(goal.toString(), (await crowdsale.goal()).toString());
    assert.equal(cap.toString(), (await crowdsale.cap()).toString());
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

  it('should be token owner', async function () {
    const owner = await token.owner();
    assert.equal(owner, crowdsale.address);
  });

  it('should be ended only after end', async function () {
    let ended = await crowdsale.hasEnded();
    assert.equal(ended, false);
    await increaseTimeTestRPCTo(afterEndTime);
    ended = await crowdsale.hasEnded();
    assert.equal(ended, true);
  });

  it('should fail creating crowdsale with zero maxGasPrice', async function () {
    try {
      await Crowdsale.new(startTime, endTime, 0, maxCallFrequency, goal, cap, wallet, {from: owner});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  describe('accepting payments', function () {

    it('should reject payments before start', async function () {
      try {
        await crowdsale.send(value);
      } catch (e) {
        assertExpectedException(e);
      }
      try {
        await crowdsale.buyTokens(investor, {from: investor, value: value});
      } catch(e) {
        assertExpectedException(e);
      }
    });

    it('should accept payments after start', async function () {
      await increaseTimeTestRPCTo(startTime);
      await crowdsale.sendTransaction({value: value, from: investor});
      await crowdsale.buyTokens(investor, {value: value, from: investor});
    });

    it('should reject payments after end', async function () {
      await increaseTimeTestRPCTo(afterEndTime);
      try {
        await crowdsale.sendTransaction({value: value, from: investor});
      } catch (e) {
        assertExpectedException(e);
      }
      try {
        await crowdsale.buyTokens(investor, {value: value, from: investor});
      } catch(e) {
        assertExpectedException(e);
      }
    });

  });

  // RefundableCrowdsale.sol
  describe('refundable crowdsale tests', function () {

    it('should fail creating crowdsale with zero goal', async function () {
      try {
        await Crowdsale.new(startTime, endTime, maxGasPrice, maxCallFrequency, 0, cap, wallet, {from: owner});
      } catch (e) {
        assertExpectedException(e);
      }
    });

    it('should deny refunds before end', async function () {
      try {
        await crowdsale.claimRefund({from: investor});
      } catch (e) {
        assertExpectedException(e);
      }
      await increaseTimeTestRPCTo(startTime);
      try {
        await crowdsale.claimRefund({from: investor});
      } catch (e) {
        assertExpectedException(e);
      }
    });

    it('should deny refunds after end if goal was reached', async function () {
      await increaseTimeTestRPCTo(startTime);
      await crowdsale.sendTransaction({value: goal, from: investor});
      await increaseTimeTestRPCTo(afterEndTime);
      try {
        await crowdsale.claimRefund({from: investor});
      } catch (e) {
        assertExpectedException(e);
      }
    });

    it('should allow refunds after end if goal was not reached', async function () {
      await increaseTimeTestRPCTo(startTime);
      await crowdsale.sendTransaction({value: lessThanGoal, from: investor});
      await increaseTimeTestRPCTo(afterEndTime);

      await crowdsale.finalize({from: owner});

      const pre = web3.eth.getBalance(investor);
      await crowdsale.claimRefund({from: investor, gasPrice: 0});
      const post = web3.eth.getBalance(investor);
      post.minus(pre).should.be.bignumber.equal(lessThanGoal);
    });

    it('should forward funds to wallet after end if goal was reached', async function () {
      await increaseTimeTestRPCTo(startTime);
      await crowdsale.sendTransaction({value: goal, from: investor});
      await increaseTimeTestRPCTo(afterEndTime);

      const pre = web3.eth.getBalance(wallet);
      await crowdsale.finalize({from: owner});
      const post = web3.eth.getBalance(wallet);

      post.minus(pre).should.be.bignumber.equal(goal);
    });

  });

  // CappedCrowdsale.sol
  describe('capped crowdsale tests', function () {

    it('should fail creating crowdsale with zero cap', async function () {
      try {
        await Crowdsale.new(startTime, endTime, maxGasPrice, maxCallFrequency, goal, 0, wallet, {from: owner});
      } catch (e) {
        assertExpectedException(e);
      }
    });

    describe('accepting payments', function () {

      beforeEach(async function () {
        await increaseTimeTestRPCTo(startTime);
      });

      it('should accept payments within cap', async function () {
        await crowdsale.sendTransaction({value: cap.minus(lessThanCap), from: investor});
        await crowdsale.sendTransaction({value: lessThanCap, from: investor});
      });

      it('should reject payments outside cap', async function () {
        await crowdsale.sendTransaction({value: cap, from: investor});

        try {
          await crowdsale.sendTransaction({value: 1, from: investor});
        } catch (e) {
          assertExpectedException(e);
        }
      });

      it('should reject payments that exceed cap', async function () {
        try {
          await crowdsale.sendTransaction({value: cap.plus(1), from: investor});
        } catch (e) {
          assertExpectedException(e);
        }
      });

    });

    describe('ending', function () {

      beforeEach(async function () {
        await increaseTimeTestRPCTo(startTime);
      });

      it('should not be ended if under cap', async function () {
        let hasEnded = await crowdsale.hasEnded();
        hasEnded.should.equal(false);
        await crowdsale.sendTransaction({value: lessThanCap, from: investor});
        hasEnded = await crowdsale.hasEnded();
        hasEnded.should.equal(false);
      });

      it('should not be ended if just under cap', async function () {
        await crowdsale.sendTransaction({value: cap.minus(1), from: investor});
        let hasEnded = await crowdsale.hasEnded();
        hasEnded.should.equal(false);
      });

      it('should be ended if cap reached', async function () {
        await crowdsale.sendTransaction({value: cap, from: investor});
        let hasEnded = await crowdsale.hasEnded();
        hasEnded.should.equal(true);
      });

    });

  });

});
