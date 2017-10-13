var QiibeeCrowdsale = artifacts.require('./QiibeeCrowdsale.sol');

var latestTime = require('./helpers/latestTime');
var {duration} = require('./helpers/increaseTime');

contract('qbxToken Crowdsale', function(accounts) {

  it('can create a Crowdsale', async function() {
    const startTime = latestTime() + duration.days(1),
      endTime = startTime + duration.days(1);

    let crowdsale = await QiibeeCrowdsale.new(
      startTime, endTime,
      100, 5000, 10000,
      1000, 2500, 50000000000, 600,
      accounts[0]
    );

    assert.equal(startTime, parseInt(await crowdsale.startTime()));
    assert.equal(endTime, parseInt(await crowdsale.endTime()));
    assert.equal(100, parseInt(await crowdsale.initialRate()));
    assert.equal(5000, parseInt(await crowdsale.goal()));
    assert.equal(10000, parseInt(await crowdsale.cap()));
    assert.equal(50000000000, parseInt(await crowdsale.maxGasPrice()));
    assert.equal(600, parseInt(await crowdsale.maxCallFrequency()));
    assert.equal(accounts[0], parseInt(await crowdsale.wallet()));
  });

  it('can NOT create a Crowdsale', async function() {
    const startTime = latestTime() + duration.days(1),
      endTime = startTime + duration.days(1);
    try {
      // initialRate = 0
      await QiibeeCrowdsale.new(
        startTime, endTime,
        0, 5000, 10000,
        1000, 2500, 50000000000, 600,
        accounts[0]
      );

      // goal = 0
      await QiibeeCrowdsale.new(
        startTime, endTime,
        100, 0, 10000,
        1000, 2500, 50000000000, 600,
        accounts[0]
      );

      // cap = 0
      await QiibeeCrowdsale.new(
        startTime, endTime,
        100, 5000, 0,
        1000, 2500, 50000000000, 600,
        accounts[0]
      );

      // minInvest = 0
      await QiibeeCrowdsale.new(
        startTime, endTime,
        100, 5000, 10000,
        0, 2500, 50000000000, 600,
        accounts[0]
      );

      // maxInvest = 0
      await QiibeeCrowdsale.new(
        startTime, endTime,
        100, 5000, 10000,
        1000, 0, 50000000000, 600,
        accounts[0]
      );

      // maxGasPrice = 0
      await QiibeeCrowdsale.new(
        startTime, endTime,
        100, 5000, 10000,
        1000, 2500, 50000000000, 600,
        accounts[0]
      );

      // maxCallFrequency = 0
      await QiibeeCrowdsale.new(
        startTime, endTime,
        100, 5000, 10000,
        1000, 2500, 50000000000, 600,
        accounts[0]
      );
    } catch (e) {
      if (e.message.search('invalid opcode') == 0) throw e;
    }
  });

});
