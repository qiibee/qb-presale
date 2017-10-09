var QiibeeCrowdsale = artifacts.require('./QiibeeCrowdsale.sol');

var latestTime = require('./helpers/latestTime');
var {duration} = require('./helpers/increaseTime');

contract('qbxToken Crowdsale', function(accounts) {

  it('can create a Crowdsale', async function() {
    const startPreTime = latestTime() + duration.days(1),
      endPreTime = startPreTime + duration.days(1),
      startTime = endPreTime + duration.days(1),
      endTime = startTime + duration.days(1);

    let crowdsale = await QiibeeCrowdsale.new(
      startPreTime, endPreTime,
      startTime, endTime,
      100, 150, 5000, 10000,
      1000, 2500, 50000000000, 600,
      accounts[0]
    );

    assert.equal(startPreTime, parseInt(await crowdsale.startPreTime()));
    assert.equal(endPreTime, parseInt(await crowdsale.endPreTime()));
    assert.equal(startTime, parseInt(await crowdsale.startTime()));
    assert.equal(endTime, parseInt(await crowdsale.endTime()));
    assert.equal(100, parseInt(await crowdsale.initialRate()));
    assert.equal(150, parseInt(await crowdsale.preferentialRate()));
    assert.equal(5000, parseInt(await crowdsale.goal()));
    assert.equal(10000, parseInt(await crowdsale.cap()));
    assert.equal(50000000000, parseInt(await crowdsale.maxGasPrice()));
    assert.equal(600, parseInt(await crowdsale.maxCallFrequency()));
    assert.equal(accounts[0], parseInt(await crowdsale.wallet()));
  });

});
