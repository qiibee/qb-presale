var _ = require('lodash');
var colors = require('colors');
var jsc = require('jsverify');

var BigNumber = web3.BigNumber;

var help = require('./helpers');
var latestTime = require('./helpers/latestTime');
var {increaseTimeTestRPC, duration} = require('./helpers/increaseTime');

var QiibeeToken = artifacts.require('QiibeeToken.sol');
var QiibeeCrowdsale = artifacts.require('QiibeeCrowdsale.sol');

let gen = require('./generators');
let commands = require('./commands');

const LOG_EVENTS = false;

let GEN_TESTS_QTY = parseInt(process.env.GEN_TESTS_QTY);
if (isNaN(GEN_TESTS_QTY))
  GEN_TESTS_QTY = 100;

let GEN_TESTS_TIMEOUT = parseInt(process.env.GEN_TESTS_TIMEOUT);
if (isNaN(GEN_TESTS_TIMEOUT))
  GEN_TESTS_TIMEOUT = 480;

contract('QiibeeCrowdsale property-based test', function(accounts) {

  const zero = new BigNumber(0);

  let crowdsaleTestInputGen = jsc.record({
    commands: jsc.array(jsc.nonshrink(commands.crowdsaleCommandsGen)),
    crowdsale: jsc.nonshrink(gen.crowdsaleGen)
  });

  let sumBigNumbers = (arr) => _.reduce(arr, (accum, x) => accum.plus(x), zero);

  let checkCrowdsaleState = async function(state, crowdsaleData, crowdsale) {
    assert.equal(gen.getAccount(state.wallet), await crowdsale.wallet());
    assert.equal(state.crowdsalePaused, await crowdsale.paused());

    let tokensInPurchases = sumBigNumbers(_.map(state.purchases, (p) => p.tokens));
    tokensInPurchases.should.be.bignumber.equal(help.fromAtto(await crowdsale.tokensSold()));

    help.debug(colors.yellow('checking purchases total wei, purchases:', JSON.stringify(state.purchases)));
    let weiInPurchases = sumBigNumbers(_.map(state.purchases, (p) => p.wei));
    weiInPurchases.should.be.bignumber.equal(await crowdsale.weiRaised());

    assert.equal(state.crowdsaleFinalized, await crowdsale.isFinalized());

    if (state.crowdsaleFinalized) {
      // assert.equal(state.goalReached, await crowdsale.goalReached());

      state.crowdsaleData.TOTAL_SUPPLY.
        should.be.bignumber.equal(await state.token.totalSupply());
    } else {
      state.crowdsaleSupply.
        should.be.bignumber.equal(await state.token.totalSupply());
    }
  };

  var eventsWatcher;

  let runGeneratedCrowdsaleAndCommands = async function(input) {
    await increaseTimeTestRPC(60);
    let startTime = latestTime() + duration.days(1);
    let endTime = startTime + duration.days(1);
    help.debug(colors.yellow('crowdsaleTestInput data:\n', JSON.stringify(input), startTime, endTime));

    let {rate, goal, cap, minInvest, maxInvest, maxGasPrice, minBuyingRequestInterval, owner} = input.crowdsale,
      ownerAddress = gen.getAccount(input.crowdsale.owner),
      foundationWallet = gen.getAccount(input.crowdsale.foundationWallet);

    let shouldThrow = (rate == 0) ||
      (latestTime() >= startTime) ||
      (startTime >= endTime) ||
      (rate == 0) ||
      (goal == 0) ||
      (cap == 0) ||
      (goal >= cap) ||
      (minInvest == 0) ||
      (maxInvest == 0) ||
      (minInvest > maxInvest) ||
      (maxGasPrice == 0) ||
      (minBuyingRequestInterval == 0) ||
      (ownerAddress == 0) ||
      (foundationWallet == 0);

    try {
      let crowdsaleData = {
        startTime: startTime,
        endTime: endTime,
        rate: input.crowdsale.rate,
        goal: new BigNumber(help.toWei(goal)),
        cap: new BigNumber(help.toWei(cap)),
        minInvest: new BigNumber(help.toWei(minInvest)),
        maxInvest: new BigNumber(help.toWei(maxInvest)),
        minBuyingRequestInterval: minBuyingRequestInterval,
        maxGasPrice: new BigNumber(maxGasPrice),
        foundationWallet: gen.getAccount(input.crowdsale.foundationWallet),
        TOTAL_SUPPLY: 10000000000000000000000000000,
        FOUNDATION_SUPPLY: 7600000000000000000000000000,
        CROWDSALE_SUPPLY: 2400000000000000000000000000
      };

      let crowdsale = await QiibeeCrowdsale.new(
        crowdsaleData.startTime,
        crowdsaleData.endTime,
        crowdsaleData.rate,
        crowdsaleData.goal,
        crowdsaleData.cap,
        crowdsaleData.minInvest,
        crowdsaleData.maxInvest,
        crowdsaleData.maxGasPrice,
        crowdsaleData.minBuyingRequestInterval,
        crowdsaleData.foundationWallet,
        {from: ownerAddress}
      );

      assert.equal(false, shouldThrow, 'create Crowdsale should have thrown but it did not');

      let token = QiibeeToken.at(await crowdsale.token());

      eventsWatcher = crowdsale.allEvents();
      eventsWatcher.watch(function(error, log){
        if (LOG_EVENTS)
          console.log('Event:', log.event, ':',log.args);
      });

      help.debug(colors.yellow('created crowdsale at address ', crowdsale.address));

      var state = {
        crowdsaleData: crowdsaleData,
        crowdsaleContract: crowdsale,
        token: token,
        balances: {},
        tokenBalances: {},
        ethBalances: help.getAccountsBalances(accounts),
        purchases: [],
        weiRaised: zero,
        tokensSold: zero,
        crowdsalePaused: false,
        tokenPaused: true,
        crowdsaleFinalized: false,
        goalReached: false,
        owner: owner,
        crowdsaleSupply: zero,
        burnedTokens: zero,
        lastCallTime: [],
        buyerRate: [],
        whitelist: [],
        wallet: input.crowdsale.foundationWallet
      };

      for (let commandParams of input.commands) {
        let command = commands.findCommand(commandParams.type);
        try {
          state = await command.run(commandParams, state);
        }
        catch(error) {
          help.debug(colors.yellow('An error occurred, block timestamp: ' + latestTime() + '\nError: ' + error));
          if (error instanceof commands.ExceptionRunningCommand) {
            throw(new Error('command ' + JSON.stringify(commandParams) + ' has thrown.'
              + '\nError: ' + error.error));
          } else
            throw(error);
        }
      }

      // check resulting in-memory and contract state
      await checkCrowdsaleState(state, crowdsaleData, crowdsale);

    } catch(e) {
      if (!shouldThrow) {
        // only re-throw if we were not expecting this exception
        throw(e);
      }
    } finally {
      if (eventsWatcher) {
        eventsWatcher.stopWatching();
      }
    }
    return true;
  };

  afterEach(function(done) {
    eventsWatcher.stopWatching();
    done();
  });

  describe('limit tests', function () {
    it('should NOT buy tokens if amount exceeds the cap', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'fundCrowdsaleBelowCap','account':0,'finalize':false},
          { type: 'buyTokens', beneficiary: 2, account: 2, eth: 100 },
          { type: 'waitTime','seconds':duration.minutes(12)},
          { type: 'buyTokens', beneficiary: 4, account: 4, eth: 500000 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 240000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should NOT buy tokens if amount of qbx is below the min limit', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 2, eth: 0.5 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should buy tokens if amount of qbx is within the limits', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should NOT buy tokens if amount of qbx exceeds the max limit', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
          { type: 'waitTime','seconds':duration.minutes(12)},
          { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
          { type: 'waitTime','seconds':duration.minutes(12)},
          { type: 'buyTokens', beneficiary: 3, account: 2, eth: 2 },
          { type: 'waitTime','seconds':duration.minutes(12)},
          { type: 'buyTokens', beneficiary: 3, account: 2, eth: 20 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });
  });
  describe('SPAM prevention tests', function () {
    it('should NOT buy tokens with exceeding gasPrice limit', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1, gasPrice: 50000000001 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should NOT allow buyTokens if execution is made before the allowed frequency', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
          { type: 'waitTime','seconds':duration.minutes(9)},
          { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });
  });

  describe('crowdsale tests', function () {
    it('does not fail on some specific examples', async function() {

      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'sendTransaction','account':3,'beneficiary':0,'eth':7000}
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });

      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 'zero', account: 2, eth: 1 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });

      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type:'pauseCrowdsale','pause':true,'fromAccount':8},
          { type:'sendTransaction','account':0,'beneficiary':9,'eth':39}
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });

      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { 'type':'fundCrowdsaleBelowCap','account':7,'finalize':false}
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 240000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('calculates correct rate as long as tokens are sold', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'checkRate' },
          { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
          { type: 'checkRate' },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 100000 },
          { type: 'checkRate' },
          { type: 'buyTokens', beneficiary: 3, account: 4, eth: 150000 },
          { type: 'checkRate' },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 240000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('executes a normal TGE fine', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'checkRate', fromAccount: 3 },
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'fundCrowdsaleBelowCap','account':3,'finalize':false},
          { type: 'buyTokens', beneficiary: 3, account: 4, eth: 10 },
          { type: 'buyTokens', beneficiary: 3, account: 5, eth: 4 },
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 6, eth: 50000 },
          { type: 'finalizeCrowdsale', fromAccount: 2 }
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 240000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });
  });

  describe('crowdsale pause tests', function () {
    it('should handle the exception correctly when trying to pause the token during and after the crowdsale', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'pauseToken', 'pause':true, 'fromAccount':0 },
          { type: 'pauseToken', 'pause':false, 'fromAccount':0 },
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'finalizeCrowdsale', fromAccount: 0 },
          { type: 'pauseToken', 'pause':false, 'fromAccount':0 },
          { type: 'pauseToken', 'pause':true, 'fromAccount':10 }
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('should pause or handle exceptions fine', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(3)},
          { type: 'finalizeCrowdsale', fromAccount: 0 },
          { type: 'pauseToken', 'pause':false, 'fromAccount':0 },
          { type: 'pauseToken', 'pause':true, 'fromAccount':0 },
          { type: 'pauseToken', 'pause':true, 'fromAccount':10 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });
  });

  describe('crowdsale finalize tests', function () {
    it('should handle the exception correctly when trying to finalize the crowdsale before the crowdsale has ended', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'finalizeCrowdsale', fromAccount: 1 },
          { type: 'waitTime','seconds':duration.days(5)},
          { type: 'finalizeCrowdsale', fromAccount: 1 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('should run the fund and finalize crowdsale command fine', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleBelowCap','account':0,'finalize':true}
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 240000,
          maxGasPrice: 50000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should run the fund crowdsale below cap without finalize command fine', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleBelowCap','account':0,'finalize':false}
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 240000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should handle exception fine when trying to finalize and is already finalized', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleBelowCap','account':0,'finalize':true},
          { type: 'finalizeCrowdsale','fromAccount':3}
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 240000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });
  });

  describe('burn tokens tests', function () {
    it('should handle fund, finalize and burn with 0 tokens', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleBelowCap','account':0,'finalize':true},
          { type: 'burnTokens','account':4,'tokens':0}
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 240000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should run fund and finalize crowdsale below cap, then burn tokens fine', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleBelowCap','account':0,'finalize':true},
          { type: 'burnTokens','account':5,'tokens':44}
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 240000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });
  });

  it('distributes tokens correctly on any combination of bids', async function() {
    // stateful prob based tests can take a long time to finish when shrinking...
    this.timeout(GEN_TESTS_TIMEOUT * 1000);

    let property = jsc.forall(crowdsaleTestInputGen, async function(crowdsaleAndCommands) {
      if(_.find(crowdsaleAndCommands.commands, {type: 'fundCrowdsaleBelowCap'})) {
        //TODO: change this fix to something cleaner
        let crowdsaleAndCommandsFixed = crowdsaleAndCommands;
        crowdsaleAndCommandsFixed.crowdsale.minInvest = 1;
        crowdsaleAndCommandsFixed.crowdsale.maxInvest = crowdsaleAndCommandsFixed.crowdsale.cap;
        return await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommandsFixed);
      } else {
        return await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
      }
    });

    return jsc.assert(property, {tests: GEN_TESTS_QTY});
  });

  describe('ownership tests', function () {
    it('owner should be able to change wallet', async function () {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'setWallet', newAccount: 4, fromAccount: 0 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('non-owner should not be able to change wallet', async function () {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'setWallet', newAccount: 4, fromAccount: 1 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should not change wallet if 0', async function () {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'setWallet', newAccount: 'zero', fromAccount: 0 },
        ],
        crowdsale: {
          rate: 6000, goal: 36000, cap: 240000,
          minInvest: 6000, maxInvest: 48000,
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600,
          owner: 0, foundationWallet: 10
        }
      });
    });
  });
});
