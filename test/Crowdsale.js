var QiibeeCrowdsale = artifacts.require('./QiibeeCrowdsale.sol');

var latestTime = require('./helpers/latestTime');
var {duration} = require('./helpers/increaseTime');
// var help = require('./helpers');

// function ExceptionRunningCommand(e) {
//   this.error = e;
// }

// function assertExpectedException(e, shouldThrow) {
//   let isKnownException = help.isInvalidOpcodeEx(e);
//   if (!shouldThrow || !isKnownException) {
//     throw(new ExceptionRunningCommand(e));
//   }
// }


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
      1000, 2500, accounts[0]
    );

    assert.equal(startPreTime, parseInt(await crowdsale.startPreTime.call()));
    assert.equal(endPreTime, parseInt(await crowdsale.endPreTime.call()));
    assert.equal(startTime, parseInt(await crowdsale.startTime.call()));
    assert.equal(endTime, parseInt(await crowdsale.endTime.call()));
    assert.equal(100, parseInt(await crowdsale.initialRate.call()));
    assert.equal(150, parseInt(await crowdsale.preferentialRate.call()));
    assert.equal(5000, parseInt(await crowdsale.goal.call()));
    assert.equal(10000, parseInt(await crowdsale.cap.call()));
    assert.equal(accounts[0], parseInt(await crowdsale.wallet.call()));
  });

  // it('can NOT create a Crowdsale', async function() {
  //   const startPreTime = latestTime() - duration.days(1),
  //     endPreTime = startPreTime + duration.days(1),
  //     startTime = endPreTime + duration.days(1),
  //     endTime = startTime + duration.days(1);

  //   const initialRate = 100,
  //     preferentialRate = 150,
  //     goal = 5000,
  //     cap = 10000,
  //     minInvest = 1000,
  //     maxInvest = 2500;

  //   let shouldThrow = endPreTime >= startTime ||
  //     startPreTime < latestTime() ||
  //     initialRate == 0 ||
  //     preferentialRate == 0 ||
  //     cap == 0 ||
  //     goal == 0 ||
  //     goal > cap ||
  //     minInvest == 0 ||
  //     maxInvest == 0;

  //   try {
  //     await QiibeeCrowdsale.new(
  //       startPreTime, endPreTime,
  //       startTime, endTime,
  //       initialRate, preferentialRate, goal, cap,
  //       minInvest, maxInvest, accounts[0]
  //     );
  //     assert.equal(false, shouldThrow, 'new QiibeeCrowdsale should have thrown but it didn\'t');
  //   } catch (e) {
  //     assertExpectedException(e, shouldThrow);
  //   }

  // });

});
