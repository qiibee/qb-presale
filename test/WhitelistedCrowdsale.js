const WhitelistedCrowdsale = artifacts.require('../contracts/WhitelistedCrowdsaleImpl.sol');
const MintableToken = artifacts.require('MintableToken.sol');

const latestTime = require('./helpers/latestTime');
const {increaseTimeTestRPC, increaseTimeTestRPCTo} = require('./helpers/increaseTime');
const { duration } = require('./helpers/increaseTime');
const help = require('./helpers.js');

function assertExpectedException(e) {
  let isKnownException = help.isInvalidOpcodeEx(e);
  if (!isKnownException) {
    throw(e);
  }
}

const LOG_EVENTS = true;

contract('WhitelistedCrowdsale', function([owner, wallet, beneficiary, sender]) {

  const rate = 1000;
  let eventsWatcher, token, crowdsale;

  beforeEach(async function () {

    await increaseTimeTestRPC(1);

    const startTime = latestTime() + duration.days(1),
      endTime = startTime + duration.days(1);
    crowdsale = await WhitelistedCrowdsale.new(startTime, endTime, rate, wallet, {from: owner});
    token = MintableToken.at(await crowdsale.token());

    assert.equal(startTime, parseInt(await crowdsale.startTime()));
    assert.equal(endTime, parseInt(await crowdsale.endTime()));
    assert.equal(rate, parseInt(await crowdsale.rate()));
    assert.equal(wallet, parseInt(await crowdsale.wallet()));

    //start crowdsale
    await increaseTimeTestRPCTo(latestTime() + 1);
    await increaseTimeTestRPCTo(startTime + 3);

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

  const amount = 1000000000000000000;

  it('should add address to whitelist', async function () {
    assert.equal(false, await crowdsale.isWhitelisted(sender));
    await crowdsale.addToWhitelist(sender, {from: owner});
    assert.equal(true, await crowdsale.isWhitelisted(sender));

  });

  it('should reject non-whitelisted sender', async function () {
    try {
      await crowdsale.buyTokens(beneficiary, {value: amount, from: sender});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should sell to whitelisted address', async function () {
    await crowdsale.addToWhitelist(sender, {from: owner});
    await crowdsale.buyTokens(beneficiary, {value: amount, from: sender});
  });

});
