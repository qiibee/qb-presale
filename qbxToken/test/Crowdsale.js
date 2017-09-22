var QiibeeCrowdsale = artifacts.require('./QiibeeCrowdsale.sol');

var latestTime = require('./helpers/latestTime');
var {duration} = require('./helpers/increaseTime');


contract('qbxToken Crowdsale', function(accounts) {

  it('can create a Crowdsale', async function() {
    const startTimestamp = latestTime() + duration.days(1),
      endTimestamp = startTimestamp + duration.days(2);

    let crowdsale = await QiibeeCrowdsale.new(
      startTimestamp, endTimestamp,
      100, 150, 5000, 10000,
      accounts[0]
    );

    assert.equal(startTimestamp, parseInt(await crowdsale.startTime.call()));
    assert.equal(endTimestamp, parseInt(await crowdsale.endTime.call()));
    assert.equal(100, parseInt(await crowdsale.initialRate.call()));
    assert.equal(150, parseInt(await crowdsale.preferentialRate.call()));
    assert.equal(5000, parseInt(await crowdsale.goal.call()));
    assert.equal(10000, parseInt(await crowdsale.cap.call()));
    assert.equal(accounts[0], parseInt(await crowdsale.wallet.call()));

  });

});
