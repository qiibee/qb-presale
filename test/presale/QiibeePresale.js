/*
 * This are tests taken from RefundableCrowdsale.sol, CappedCrowdsale.sol from Open Zeppelin
 * and adapted to the Crowdsale.
 */

const QiibeePresale = artifacts.require('QiibeePresale.sol');
const QiibeeToken = artifacts.require('QiibeeToken.sol');

const latestTime = require('../helpers/latestTime');
const { increaseTimeTestRPC } = require('../helpers/increaseTime');
const { duration } = require('../helpers/increaseTime');
const help = require('../helpers.js');
const BigNumber = web3.BigNumber;

require('chai').
  use(require('chai-bignumber')(BigNumber)).
  should();

const LOG_EVENTS = false;

contract('QiibeePresale', function ([owner, wallet, investor]) {

  const goal = new BigNumber(help.toWei(800));
  const cap = new BigNumber(help.toWei(1800));
  const maxGasPrice = new BigNumber(5000000000000000000);
  const maxCallFrequency = 0;

  let startTime, endTime;
  let eventsWatcher, token, crowdsale;

  beforeEach(async function () {
    startTime = latestTime() + duration.weeks(1);
    endTime = startTime + duration.weeks(1);

    crowdsale = await QiibeePresale.new(startTime, endTime, goal, cap, maxGasPrice, maxCallFrequency, wallet, {from: owner});
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

  it('can create a qiibee presale', async function() {
    const startTime = latestTime() + duration.days(1),
      endTime = startTime + duration.days(1);

    await QiibeePresale.new(startTime, endTime, goal, cap, maxGasPrice, maxCallFrequency, wallet);
  });

});
