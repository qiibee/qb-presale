var help = require('../helpers');
// var _ = require('lodash');

var BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

var QiibeeToken = artifacts.require('../QiibeeToken.sol');

const LOG_EVENTS = false;

contract('qiibeeToken', function(accounts) {

  var token;
  var eventsWatcher;

  beforeEach(async function() {
    const rate = 6000;
    const goal = 36000;
    const cap = 240000;
    const minInvest = 20;
    const maxInvest = 240000;
    const maxGasPrice = 500000000000;
    const minBuyingRequestInterval = 600;
    const crowdsale = await help.simulateCrowdsale(
      rate,
      new BigNumber(help.toAtto(goal)),
      new BigNumber(help.toAtto(cap)),
      new BigNumber(help.toAtto(minInvest)),
      new BigNumber(help.toAtto(maxInvest)),
      new BigNumber(maxGasPrice),
      new BigNumber(minBuyingRequestInterval),
      accounts,
      [140,100,80,0]
    );
    token = QiibeeToken.at(await crowdsale.token());

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

  it('has name, symbol and decimals', async function() {
    assert.equal('QBX', await token.SYMBOL());
    assert.equal('qiibeeCoin', await token.NAME());
    assert.equal(18, await token.DECIMALS());
  });

  it('can burn tokens', async function() {
    let totalSupply = await token.totalSupply.call();
    new BigNumber(0).should.be.bignumber.equal(await token.balanceOf(accounts[5]));

    let initialBalance = web3.toWei(1);
    await token.transfer(accounts[5], initialBalance, { from: accounts[1] });
    initialBalance.should.be.bignumber.equal(await token.balanceOf(accounts[5]));

    let burned = web3.toWei(0.3);

    assert.equal(accounts[0], await token.owner());

    // pause the token
    await token.pause({from: accounts[0]});

    try {
      await token.burn(burned, {from: accounts[5]});
      assert(false, 'burn should have thrown');
    } catch (error) {
      if (!help.isInvalidOpcodeEx(error)) throw error;
    }
    await token.unpause({from: accounts[0]});

    // now burn should work
    await token.burn(burned, {from: accounts[5]});

    new BigNumber(initialBalance).minus(burned).
      should.be.bignumber.equal(await token.balanceOf(accounts[5]));
    totalSupply.minus(burned).should.be.bignumber.equal(await token.totalSupply.call());
  });

});
