var QiibeePresale = artifacts.require('QiibeePresale.sol');

var latestTime = require('../helpers/latestTime');
var { duration } = require('../helpers/increaseTime');
var help = require('../helpers.js');

function assertExpectedException(e) {
  let isKnownException = help.isInvalidOpcodeEx(e);
  if (!isKnownException) {
    throw(e);
  }
}

contract('qiibee Presale', function(accounts) {

  it('can create a Presale', async function() {
    const startTime = latestTime() + duration.days(1),
      endTime = startTime + duration.days(1);

    let crowdsale = await QiibeePresale.new(
      startTime, endTime,
      50000000000, 600,
      5000, 10000,
      accounts[0]
    );

    assert.equal(startTime, parseInt(await crowdsale.startTime()));
    assert.equal(endTime, parseInt(await crowdsale.endTime()));
    assert.equal(5000, parseInt(await crowdsale.goal()));
    assert.equal(10000, parseInt(await crowdsale.cap()));
    assert.equal(50000000000, parseInt(await crowdsale.maxGasPrice()));
    assert.equal(600, parseInt(await crowdsale.maxCallFrequency()));
    assert.equal(accounts[0], parseInt(await crowdsale.wallet()));
  });

  it('can NOT create a Presale', async function() {
    const startTime = latestTime() + duration.days(1),
      endTime = startTime + duration.days(1);

    // goal = 0
    try {
      await QiibeePresale.new(
        startTime, endTime,
        50000000000, 600,
        0, 10000,
        accounts[0]
      );
    } catch (e) {
      assertExpectedException(e);
    }

    // cap = 0
    try {
      await QiibeePresale.new(
        startTime, endTime,
        50000000000, 600,
        5000, 0,
        accounts[0]
      );
    } catch (e) {
      assertExpectedException(e);
    }

    // maxGasPrice = 0
    try {
      await QiibeePresale.new(
        startTime, endTime,
        0, 600,
        5000, 10000,
        accounts[0]
      );
    } catch (e) {
      assertExpectedException(e);
    }

    // maxCallFrequency = 0
    try {
      await QiibeePresale.new(
        startTime, endTime,
        50000000000, 0,
        5000, 10000,
        accounts[0]
      );
    } catch (e) {
      assertExpectedException(e);
    }
  });

});
