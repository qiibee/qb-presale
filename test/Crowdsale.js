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

});
