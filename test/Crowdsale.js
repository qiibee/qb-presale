/*
 * This are tests taken from RefundableCrowdsale.sol, CappedCrowdsale.sol from Open Zeppelin
 * and adapted to the Crowdsale.sol.
 */

const Crowdsale = artifacts.require('CrowdsaleImpl.sol');
const QiibeeToken = artifacts.require('QiibeeToken.sol');

const latestTime = require('./helpers/latestTime');
const {increaseTimeTestRPCTo} = require('./helpers/increaseTime');
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

const value = help.toWei(1);

contract('Crowdsale', function ([owner, wallet, investor]) {

  const defaultTimeDelta = duration.days(1); // time delta used in time calculations (for start, end1 & end2)
  const defaults = {
    goal: new BigNumber(help.toWei(800)),
    lessThanGoal: new BigNumber(help.toWei(750)),
    cap: new BigNumber(help.toWei(1800)),
    lessThanCap: new BigNumber(help.toWei(1000)),
    maxGasPrice: new BigNumber(5000000000000000000),
    minBuyingRequestInterval: 600,
    wallet: wallet
  };

  async function createCrowdsale(params) {
    const startTime = params.startTime === undefined ? (latestTime() + defaultTimeDelta) : params.startTime,
      endTime = params.endTime === undefined ? (startTime + duration.weeks(1)) : params.endTime,
      goal = params.goal === undefined ? defaults.goal : params.goal,
      cap = params.cap === undefined ? defaults.cap : params.cap,
      maxGasPrice = params.maxGasPrice === undefined ? defaults.maxGasPrice : params.maxGasPrice,
      minBuyingRequestInterval = params.minBuyingRequestInterval === undefined ? defaults.minBuyingRequestInterval : params.minBuyingRequestInterval,
      wallet = params.wallet === undefined ? defaults.wallet : params.foundationWallet;

    return await Crowdsale.new(startTime, endTime, goal, cap, maxGasPrice, minBuyingRequestInterval, wallet, {from: owner});
  }

  describe('create crowdsale tests', function () {

    it('can NOT create crowdsale with endTime bigger than startTime', async function () {
      const startTime = latestTime() + duration.weeks(1),
        endTime = startTime - duration.weeks(1);
      try {
        await createCrowdsale({startTime: startTime, endTime: endTime});
      } catch(e) {
        assertExpectedException(e);
      }
    });

    it('can NOT create crowdsale with zero minBuyingRequestInterval', async function () {
      try {
        await createCrowdsale({minBuyingRequestInterval: 0});
      } catch(e) {
        assertExpectedException(e);
      }
    });

    it('can NOT create crowdsale with zero goal', async function () {
      try {
        await createCrowdsale({goal: 0});
      } catch(e) {
        assertExpectedException(e);
      }
    });

    it('can NOT create crowdsale with zero wallet', async function () {
      try {
        await createCrowdsale({goal: help.zeroAddress});
      } catch(e) {
        assertExpectedException(e);
      }
    });

  });

  it('should be token owner', async function () {
    const crowdsale = await createCrowdsale({}),
      token = QiibeeToken.at(await crowdsale.token()),
      owner = await token.owner();
    assert.equal(owner, crowdsale.address);
  });

  it('should be ended only after end', async function () {
    const crowdsale = await createCrowdsale({});
    let ended = await crowdsale.hasEnded();
    assert.equal(ended, false);
    await increaseTimeTestRPCTo(await crowdsale.endTime() + duration.seconds(1));
    ended = await crowdsale.hasEnded();
    assert.equal(ended, true);
  });

  it('should fail creating crowdsale with zero maxGasPrice', async function () {
    try {
      await createCrowdsale({maxGasPrice: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  describe('accepting payments', function () {

    it('should reject payments before start', async function () {
      const crowdsale = await createCrowdsale({});
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

    it('should reject payments if beneficiary address is zero', async function () {
      const crowdsale = await createCrowdsale({});
      await increaseTimeTestRPCTo(await crowdsale.startTime());
      try {
        await crowdsale.buyTokens(help.zeroAddress, {value: value, from: investor});
      } catch (e) {
        assertExpectedException(e);
      }
    });

    it('should accept payments after start', async function () {
      const crowdsale = await createCrowdsale({});
      await increaseTimeTestRPCTo(await crowdsale.startTime());
      await crowdsale.sendTransaction({value: value, from: investor});
      await crowdsale.buyTokens(investor, {value: value, from: investor});
    });

    it('should reject payments after end', async function () {
      const crowdsale = await createCrowdsale({});
      await increaseTimeTestRPCTo(await crowdsale.endTime() + duration.seconds(1));
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

  describe('finalize crowdsale tests', function () {

    it('should reject finalize if crowdsale is already finalized', async function () {
      const crowdsale = await createCrowdsale({});
      await increaseTimeTestRPCTo(await crowdsale.startTime());
      await crowdsale.sendTransaction({value: defaults.goal, from: investor});
      await increaseTimeTestRPCTo(await crowdsale.endTime() + duration.seconds(1));
      await crowdsale.finalize({from: owner});
      try {
        await crowdsale.finalize({from: owner});
      } catch(e) {
        assertExpectedException(e);
      }
    });

    it('should reject finalize if cap not reached and now < endTime', async function () {
      const crowdsale = await createCrowdsale({});
      await increaseTimeTestRPCTo(await crowdsale.startTime());
      await crowdsale.sendTransaction({value: defaults.goal, from: investor});
      try {
        await crowdsale.finalize({from: owner});
      } catch(e) {
        assertExpectedException(e);
      }
    });

    it('should finalize if cap reached even though now < endTime', async function () {
      const crowdsale = await createCrowdsale({});
      await increaseTimeTestRPCTo(await crowdsale.startTime());
      await crowdsale.sendTransaction({value: defaults.cap, from: investor});
      try {
        await crowdsale.finalize({from: owner});
      } catch(e) {
        assertExpectedException(e);
      }
    });

  });
  // RefundableCrowdsale.sol
  describe('refundable crowdsale tests', function () {

    it('can NOT create crowdsale with goal less than zero', async function () {
      try {
        await createCrowdsale({goal: 0});
      } catch(e) {
        assertExpectedException(e);
      }
    });

    it('should deny refunds before end', async function () {
      const crowdsale = await createCrowdsale({});
      try {
        await crowdsale.claimRefund({from: investor});
      } catch (e) {
        assertExpectedException(e);
      }
      await increaseTimeTestRPCTo(await crowdsale.startTime());
      try {
        await crowdsale.claimRefund({from: investor});
      } catch (e) {
        assertExpectedException(e);
      }
    });

    it('should deny refunds after end if goal was reached', async function () {
      const crowdsale = await createCrowdsale({});
      await increaseTimeTestRPCTo(await crowdsale.startTime());
      await crowdsale.sendTransaction({value: defaults.goal, from: investor});
      await increaseTimeTestRPCTo(await crowdsale.endTime() + duration.seconds(1));
      try {
        await crowdsale.claimRefund({from: investor});
      } catch (e) {
        assertExpectedException(e);
      }
    });

    it('should allow refunds after end if goal was not reached', async function () {
      const crowdsale = await createCrowdsale({});
      await increaseTimeTestRPCTo(await crowdsale.startTime());
      await crowdsale.sendTransaction({value: defaults.lessThanGoal, from: investor});
      await increaseTimeTestRPCTo(await crowdsale.endTime() + duration.seconds(1));

      await crowdsale.finalize({from: owner});

      const pre = web3.eth.getBalance(investor);
      await crowdsale.claimRefund({from: investor, gasPrice: 0});
      const post = web3.eth.getBalance(investor);
      post.minus(pre).should.be.bignumber.equal(defaults.lessThanGoal);
    });

    it('should forward funds to wallet after end if goal was reached', async function () {
      const crowdsale = await createCrowdsale({});
      await increaseTimeTestRPCTo(await crowdsale.startTime());
      await crowdsale.sendTransaction({value: defaults.goal, from: investor});
      await increaseTimeTestRPCTo(await crowdsale.endTime() + duration.seconds(1));

      const pre = web3.eth.getBalance(wallet);
      await crowdsale.finalize({from: owner});
      const post = web3.eth.getBalance(wallet);

      post.minus(pre).should.be.bignumber.equal(defaults.goal);
    });

  });

  // CappedCrowdsale.sol
  describe('capped crowdsale tests', function () {
    it('should fail creating crowdsale with zero cap', async function () {
      try {
        await createCrowdsale({cap: 0});
      } catch (e) {
        assertExpectedException(e);
      }
    });

    describe('accepting payments', function () {

      it('should accept payments within cap', async function () {
        const crowdsale = await createCrowdsale({});
        await increaseTimeTestRPCTo(await crowdsale.startTime());
        await crowdsale.sendTransaction({value: defaults.cap.minus(defaults.lessThanCap), from: investor});
        await crowdsale.sendTransaction({value: defaults.lessThanCap, from: investor});
      });

      it('should reject payments outside cap', async function () {
        const crowdsale = await createCrowdsale({});
        await increaseTimeTestRPCTo(await crowdsale.startTime());
        await crowdsale.sendTransaction({value: defaults.cap, from: investor});

        try {
          await crowdsale.sendTransaction({value: 1, from: investor});
        } catch (e) {
          assertExpectedException(e);
        }
      });

      it('should reject payments that exceed cap', async function () {
        const crowdsale = await createCrowdsale({});
        await increaseTimeTestRPCTo(await crowdsale.startTime());
        try {
          await crowdsale.sendTransaction({value: defaults.cap.plus(1), from: investor});
        } catch (e) {
          assertExpectedException(e);
        }
      });

    });

    describe('ending', function () {

      it('should not be ended if under cap', async function () {
        const crowdsale = await createCrowdsale({});
        await increaseTimeTestRPCTo(await crowdsale.startTime());
        let hasEnded = await crowdsale.hasEnded();
        hasEnded.should.equal(false);
        await crowdsale.sendTransaction({value: defaults.lessThanCap, from: investor});
        hasEnded = await crowdsale.hasEnded();
        hasEnded.should.equal(false);
      });

      it('should not be ended if just under cap', async function () {
        const crowdsale = await createCrowdsale({});
        await increaseTimeTestRPCTo(await crowdsale.startTime());
        await crowdsale.sendTransaction({value: defaults.cap.minus(1), from: investor});
        let hasEnded = await crowdsale.hasEnded();
        hasEnded.should.equal(false);
      });

      it('should be ended if cap reached', async function () {
        const crowdsale = await createCrowdsale({});
        await increaseTimeTestRPCTo(await crowdsale.startTime());
        await crowdsale.sendTransaction({value: defaults.cap, from: investor});
        let hasEnded = await crowdsale.hasEnded();
        hasEnded.should.equal(true);
      });

    });

  });

});
