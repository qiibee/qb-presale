var _ = require('lodash');
var colors = require('colors');
var jsc = require('jsverify');

var BigNumber = web3.BigNumber;

var help = require('./helpers');
var latestTime = require('./helpers/latestTime');
var {increaseTimeTestRPC, duration} = require('./helpers/increaseTime');

var QiibeeToken = artifacts.require('./QiibeeToken.sol');
var QiibeePresale = artifacts.require('./QiibeePresale.sol');

let gen = require('./generators');
let commands = require('./commands');

const LOG_EVENTS = false;

let GEN_TESTS_QTY = parseInt(process.env.GEN_TESTS_QTY);
if (isNaN(GEN_TESTS_QTY))
  GEN_TESTS_QTY = 50;

let GEN_TESTS_TIMEOUT = parseInt(process.env.GEN_TESTS_TIMEOUT);
if (isNaN(GEN_TESTS_TIMEOUT))
  GEN_TESTS_TIMEOUT = 240;

contract('QiibeePresale property-based test', function(accounts) {

  const zero = new BigNumber(0);

  let presaleTestInputGen = jsc.record({
    commands: jsc.array(jsc.nonshrink(commands.presaleCommandsGen)),
    presale: jsc.nonshrink(gen.presaleGen)
  });

  let sumBigNumbers = (arr) => _.reduce(arr, (accum, x) => accum.plus(x), zero);

  let checkPresaleState = async function(state, presaleData, presale) {
    assert.equal(gen.getAccount(state.wallet), await presale.wallet());
    assert.equal(state.presalePaused, await presale.paused());

    let tokensInPurchases = sumBigNumbers(_.map(state.purchases, (p) => p.tokens));
    tokensInPurchases.should.be.bignumber.equal(help.fromAtto(await presale.tokensSold()));

    help.debug(colors.yellow('checking purchases total wei, purchases:', JSON.stringify(state.purchases)));
    let weiInPurchases = sumBigNumbers(_.map(state.purchases, (p) => p.wei));
    weiInPurchases.should.be.bignumber.equal(await presale.weiRaised());

    assert.equal(state.presaleFinalized, await presale.isFinalized());

    // if (state.presaleFinalized) {
    //   assert.equal(state.goalReached, await presale.goalReached());
    // }
  };

  let runGeneratedPresaleAndCommands = async function(input) {
    await increaseTimeTestRPC(60);
    let startTime = latestTime() + duration.days(1);
    let endTime = startTime + duration.days(1);
    help.debug(colors.yellow('presaleTestInput data:\n', JSON.stringify(input), startTime, endTime));

    let {maxGasPrice, minBuyingRequestInterval, goal, cap, owner} = input.presale,
      ownerAddress = gen.getAccount(input.presale.owner),
      foundationWallet = gen.getAccount(input.presale.foundationWallet);

    let shouldThrow = (latestTime() >= startTime) ||
      (startTime >= endTime) ||
      (maxGasPrice == 0) ||
      (minBuyingRequestInterval == 0) ||
      (goal == 0) ||
      (cap == 0) ||
      (goal >= cap) ||
      (ownerAddress == 0) ||
      (foundationWallet == 0);

    var eventsWatcher;

    try {

      let presaleData = {
        startTime: startTime,
        endTime: endTime,
        maxGasPrice: new BigNumber(maxGasPrice),
        minBuyingRequestInterval: minBuyingRequestInterval,
        goal: new BigNumber(help.toWei(goal)),
        cap: new BigNumber(help.toWei(cap)),
        foundationWallet: gen.getAccount(input.presale.foundationWallet),
      };

      let presale = await QiibeePresale.new(
        presaleData.startTime,
        presaleData.endTime,
        presaleData.goal,
        presaleData.cap,
        presaleData.maxGasPrice,
        presaleData.minBuyingRequestInterval,
        presaleData.foundationWallet,
        {from: ownerAddress}
      );

      let token = QiibeeToken.at(await presale.token());
      assert.equal(false, shouldThrow, 'create Presale should have thrown but it did not');

      eventsWatcher = presale.allEvents();
      eventsWatcher.watch(function(error, log){
        if (LOG_EVENTS)
          console.log('Event:', log.event, ':',log.args);
      });

      help.debug(colors.yellow('created presale at address ', presale.address));

      var state = {
        presaleData: presaleData,
        presaleContract: presale,
        token: token,
        balances: {},
        ethBalances: help.getAccountsBalances(accounts),
        purchases: [],
        weiRaised: zero,
        tokensSold: zero,
        tokenPaused: true,
        presaleFinalized: false,
        presalePaused: false,
        goalReached: false,
        presaleSupply: zero,
        burnedTokens: zero,
        owner: owner,
        accredited: [],
        lastCallTime: [],
        wallet: input.presale.foundationWallet
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
      await checkPresaleState(state, presaleData, presale);

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

  it('should allow accredited investors to buy tokens', async function () {
    await runGeneratedPresaleAndCommands({
      commands: [
        { type: 'waitTime','seconds':duration.days(1)},
        { type: 'addAccredited', investor: 4, rate: 6000, cliff: 600, vesting: 600, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 0 },
        { type: 'presaleSendTransaction', beneficiary: 3, account: 4, eth: 1 },
      ],
      presale: {
        maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
      }
    });
  });

  it('should allow accredited investors to buy tokens', async function () {
    await runGeneratedPresaleAndCommands({
      commands: [
        { type: 'waitTime','seconds':duration.days(1)},
        { type: 'addAccredited', investor: 4, rate: 6000, cliff: 600, vesting: 600, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 0 },
        { type: 'presaleSendTransaction', beneficiary: 3, account: 4, eth: 1 },
      ],
      presale: {
        maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
      }
    });
  });

  it('should allow accredited investors to buy non-vested tokens', async function () {
    await runGeneratedPresaleAndCommands({
      commands: [
        { type: 'waitTime','seconds':duration.days(1)},
        { type: 'addAccredited', investor: 4, rate: 6000, cliff: 0, vesting: 0, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 0 },
        { type: 'presaleSendTransaction', beneficiary: 3, account: 4, eth: 1 },
      ],
      presale: {
        maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
      }
    });
  });

  it('should NOT allow accredited investors to invest more than maxCumulativeInvest', async function () {
    await runGeneratedPresaleAndCommands({
      commands: [
        { type: 'waitTime','seconds':duration.days(1)},
        { type: 'addAccredited', investor: 4, rate: 6000, cliff: 600, vesting: 600, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 0 },
        { type: 'presaleBuyTokens', beneficiary: 3, account: 4, eth: 3 },
      ],
      presale: {
        maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
      }
    });
  });

  it('should NOT allow accredited investors to invest less than minInvest', async function () {
    await runGeneratedPresaleAndCommands({
      commands: [
        { type: 'waitTime','seconds':duration.days(1)},
        { type: 'addAccredited', investor: 4, rate: 6000, cliff: 600, vesting: 600, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 0 },
        { type: 'presaleBuyTokens', beneficiary: 3, account: 4, eth: 0.5 },
      ],
      presale: {
        maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
      }
    });
  });

  it('should NOT allow non-accredited investors to invest', async function () {
    await runGeneratedPresaleAndCommands({
      commands: [
        { type: 'waitTime','seconds':duration.days(1)},
        { type: 'presaleSendTransaction', beneficiary: 3, account: 4, eth: 1 },
      ],
      presale: {
        maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
      }
    });
  });

  describe('add to accredited list', function () {
    it('should NOT be able to add investor to accredited list with rate zero', async function () {
      await runGeneratedPresaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'addAccredited', investor: 4, rate: 0, cliff: 600, vesting: 600, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 2 },
        ],
        presale: {
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
        }
      });
    });

    it('should NOT be able to add investor to accredited list with cliff less than zero', async function () {
      await runGeneratedPresaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'addAccredited', investor: 4, rate: 6000, cliff: -600, vesting: 600, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 2 },
        ],
        presale: {
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
        }
      });
    });

    it('should be able to add investor to accredited list with zero cliff', async function () {
      await runGeneratedPresaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'addAccredited', investor: 4, rate: 6000, cliff: 0, vesting: 600, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 2 },
        ],
        presale: {
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
        }
      });
    });

    it('should NOT be able to add investor to accredited list with vesting less than zero', async function () {
      await runGeneratedPresaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'addAccredited', investor: 4, rate: 6000, cliff: 600, vesting: -600, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 2 },
        ],
        presale: {
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
        }
      });
    });

    it('should NOT be able to add investor to accredited list with maxCumulativeInvest less than zero', async function () {
      await runGeneratedPresaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'addAccredited', investor: 4, rate: 6000, cliff: 600, vesting: 600, minInvest: 1, maxCumulativeInvest: -2, fromAccount: 2 },
        ],
        presale: {
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
        }
      });
    });

    it('should NOT be able to add investor to accredited list with minInvest zero', async function () {
      await runGeneratedPresaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'addAccredited', investor: 4, rate: 6000, cliff: 600, vesting: 600, minInvest: 0, maxCumulativeInvest: 2, fromAccount: 2 },
        ],
        presale: {
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
        }
      });
    });

    it('should NOT be able to add investor to accredited list if not owner', async function () {
      await runGeneratedPresaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'addAccredited', investor: 4, rate: 6000, cliff: 600, vesting: 600, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 2 },
        ],
        presale: {
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
        }
      });
    });

    it('should NOT be able to add investor to accredited list if address is zero', async function () {
      await runGeneratedPresaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'addAccredited', investor: 'zero', rate: 6000, cliff: 600, vesting: 600, minInvest: 1, maxCumulativeInvest: 2, fromAccount: 0 },
        ],
        presale: {
          maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
        }
      });
    });
  });

  it('distributes tokens correctly on any combination of bids', async function() {
    // stateful prob based tests can take a long time to finish when shrinking...
    this.timeout(GEN_TESTS_TIMEOUT * 1000);

    let property = jsc.forall(presaleTestInputGen, async function(presaleAndCommands) {
      return await runGeneratedPresaleAndCommands(presaleAndCommands);
    });

    return jsc.assert(property, {tests: GEN_TESTS_QTY});
  });

  it('should finish presale fine', async function() {
    let presaleAndCommands = {
      commands: [
        { type: 'waitTime','seconds':duration.days(4)},
        { type: 'finalizePresale', fromAccount: 1 }
      ],
      presale: {
        maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
      }
    };

    await runGeneratedPresaleAndCommands(presaleAndCommands);
  });

  it('should NOT finish presale if it has already been finalized', async function() {
    let presaleAndCommands = {
      commands: [
        { type: 'waitTime','seconds':duration.days(4)},
        { type: 'finalizePresale', fromAccount: 1 },
        { type: 'finalizePresale', fromAccount: 2 }
      ],
      presale: {
        maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
      }
    };

    await runGeneratedPresaleAndCommands(presaleAndCommands);
  });

  it('should handle the exception correctly when trying to finalize the presale before the presale has ended', async function() {
    let presaleAndCommands = {
      commands: [
        { type: 'waitTime','seconds':duration.minutes(60)},
        { type: 'finalizePresale', fromAccount: 1 }
      ],
      presale: {
        maxGasPrice: 50000000000, minBuyingRequestInterval: 600, goal: 36000, cap: 240000, foundationWallet: 10, owner: 0
      }
    };

    await runGeneratedPresaleAndCommands(presaleAndCommands);
  });

});
