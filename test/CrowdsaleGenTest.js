var _ = require('lodash');
var colors = require('colors');
var jsc = require('jsverify');

var BigNumber = web3.BigNumber;

var help = require('./helpers');
var latestTime = require('./helpers/latestTime');
var {increaseTimeTestRPC, duration} = require('./helpers/increaseTime');

var QiibeeToken = artifacts.require('./QiibeeToken.sol');
var QiibeeCrowdsale = artifacts.require('./QiibeeCrowdsale.sol');

let gen = require('./generators');
let commands = require('./commands');

const LOG_EVENTS = true;

let GEN_TESTS_QTY = parseInt(process.env.GEN_TESTS_QTY);
if (isNaN(GEN_TESTS_QTY))
  GEN_TESTS_QTY = 50;

let GEN_TESTS_TIMEOUT = parseInt(process.env.GEN_TESTS_TIMEOUT);
if (isNaN(GEN_TESTS_TIMEOUT))
  GEN_TESTS_TIMEOUT = 240;

contract('QiibeeCrowdsale Property-based test', function() {

  const zero = new BigNumber(0);

  //TODO: fix
  let crowdsaleTestInputGen = jsc.record({
    commands: jsc.array(jsc.nonshrink(commands.commandsGen)),
    crowdsale: jsc.nonshrink(gen.crowdsaleGen)
  });

  let sumBigNumbers = (arr) => _.reduce(arr, (accum, x) => accum.plus(x), zero);

  let checkCrowdsaleState = async function(state, crowdsaleData, crowdsale) {

    assert.equal(state.wallet, await crowdsale.wallet());
    assert.equal(state.crowdsalePaused, await crowdsale.paused());

    let tokensInPurchases = sumBigNumbers(_.map(state.purchases, (p) => p.tokens));
    tokensInPurchases.should.be.bignumber.equal(help.fromAtto(await crowdsale.tokensSold()));

    // let presaleWei = sumBigNumbers(_.map(state.presalePurchases, (p) => p.wei));
    // presaleWei.should.be.bignumber.equal(await crowdsale.totalPresaleWei.call());

    help.debug(colors.yellow('checking purchases total wei, purchases:', JSON.stringify(state.purchases)));
    let weiInPurchases = sumBigNumbers(_.map(state.purchases, (p) => p.wei));
    weiInPurchases.should.be.bignumber.equal(await crowdsale.weiRaised());

    // Check presale tokens sold
    // state.totalPresaleWei.should.be.bignumber.equal(await crowdsale.totalPresaleWei.call());
    assert.equal(state.crowdsaleFinalized, await crowdsale.isFinalized());

    if (state.crowdsaleFinalized) {
      assert.equal(state.goalReached, await crowdsale.goalReached());

      let vaultState = parseInt((await crowdsale.getVaultState()).toString());
      assert.equal(state.vaultState, vaultState);

      state.crowdsaleData.TOTAL_SUPPLY.
        should.be.bignumber.equal(await state.token.totalSupply());
    } else {
      state.crowdsaleSupply.
        should.be.bignumber.equal(await state.token.totalSupply());
    }
  };

  let runGeneratedCrowdsaleAndCommands = async function(input) {
    await increaseTimeTestRPC(60);
    let startPreTime = latestTime() + duration.days(1);
    let endPreTime = startPreTime + duration.days(1);
    let startTime = endPreTime + duration.days(1);
    let endTime = startTime + duration.days(1);
    help.debug(colors.yellow('crowdsaleTestInput data:\n', JSON.stringify(input), startTime, endTime));

    let {initialRate, goal, cap, minInvest, maxInvest, preferentialRate, owner} = input.crowdsale,
      ownerAddress = gen.getAccount(input.crowdsale.owner),
      foundationWallet = gen.getAccount(input.crowdsale.foundationWallet);

    let shouldThrow = (initialRate == 0) ||
      (latestTime() >= startPreTime) ||
      (startPreTime >= endTime) ||
      (startTime < endPreTime) ||
      (startTime >= endTime) ||
      (preferentialRate == 0) ||
      (goal == 0) ||
      (cap == 0) ||
      (minInvest == 0) ||
      (maxInvest == 0) ||
      (goal >= cap) ||
      (ownerAddress == 0) ||
      (foundationWallet == 0);

    var eventsWatcher;

    try {
      let crowdsaleData = {
        startPreTime: startPreTime,
        endPreTime: endPreTime,
        startTime: startTime,
        endTime: endTime,
        initialRate: input.crowdsale.initialRate,
        preferentialRate: input.crowdsale.preferentialRate,
        goal: new BigNumber(help.toAtto(input.crowdsale.goal)),
        cap: new BigNumber(help.toAtto(input.crowdsale.cap)),
        maxCallFrequency: 600,
        maxGasPrice: 50000000000,
        minInvest: new BigNumber(help.toAtto(input.crowdsale.minInvest)),
        maxInvest: new BigNumber(help.toAtto(input.crowdsale.maxInvest)),
        foundationWallet: gen.getAccount(input.crowdsale.foundationWallet),
        TOTAL_SUPPLY: 10000000000000000000000000000,
        FOUNDATION_SUPPLY: 7600000000000000000000000000,
        CROWDSALE_SUPPLY: 2400000000000000000000000000
      };

      let crowdsale = await QiibeeCrowdsale.new(
        crowdsaleData.startPreTime,
        crowdsaleData.endPreTime,
        crowdsaleData.startTime,
        crowdsaleData.endTime,
        crowdsaleData.initialRate,
        crowdsaleData.preferentialRate,
        crowdsaleData.goal,
        crowdsaleData.cap,
        crowdsaleData.minInvest,
        crowdsaleData.maxInvest,
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

      // issue & transfer tokens for founders payments
      // let maxFoundersPaymentTokens = crowdsaleData.maxTokens * (crowdsaleData.ownerPercentage / 1000.0) ;

      var state = {
        crowdsaleData: crowdsaleData,
        crowdsaleContract: crowdsale,
        token: token,
        balances: {},
        ethBalances: {},
        allowances: {},
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
        returnedWeiForBurnedTokens: new BigNumber(0),
        vault: {},
        vaultState: 0,
        lastCallTime: [],
        buyerRate: [],
        whitelist: [],
        wallet: crowdsaleData.foundationWallet
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

  // // SPAM PREVENETION TESTS
  // it('whitelisted investor should be able to buy tokens even though the amount of qbx exceeds the max limit, during pre-tge', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'buyTokens', beneficiary: 2, account: 4, eth: 100 },
  //       { type: 'waitTime','seconds':duration.minutes(20)},
  //       { type: 'buyTokens', beneficiary: 2, account: 4, eth: 100 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('whitelisted investor should NOT be able to buy tokens if they exceed the amount of qbx exceeds the max limit, during tge', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'buyTokens', beneficiary: 2, account: 4, eth: 100 },
  //       { type: 'buyTokens', beneficiary: 2, account: 4, eth: 100 },
  //       { type: 'waitTime','seconds':duration.days(2)},
  //       { type: 'buyTokens', beneficiary: 2, account: 4, eth: 1 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should NOT buy tokens if amount of qbx is below the min limit', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 0.5 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should buy tokens if amount of qbx is within the limits', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
  //       { type: 'waitTime','seconds':duration.minutes(12)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should NOT buy tokens if amount of qbx exceeds the max limit', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
  //       { type: 'waitTime','seconds':duration.minutes(12)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
  //       { type: 'waitTime','seconds':duration.minutes(12)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 2 },
  //       { type: 'waitTime','seconds':duration.minutes(12)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 20 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should NOT buy tokens with exceeding gasPrice limit', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1, gasPrice: 50000000001 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should allow whitelisted investors to buy tokens with exceeding gasPrice limit, during pre-tge', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1, gasPrice: 50000000001},
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should NOT allow whitelisted investors to buy tokens with exceeding gasPrice limit, during tge', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       // { type: 'buyTokens', beneficiary: 3, account: 4, eth: 1, gasPrice: 50000000001},
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should NOT allow buyTokens if execution is made before the allowed frequency', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
  //       { type: 'waitTime','seconds':duration.minutes(9)},
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 1 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should allow whitelisted investors to buyTokens if execution is made before the allowed frequency, during pre-tge', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'buyTokens', beneficiary: 2, account: 4, eth: 100 },
  //       { type: 'waitTime','seconds':duration.minutes(5)},
  //       { type: 'buyTokens', beneficiary: 2, account: 4, eth: 100 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should allow whitelisted investors to buyTokens if execution is made before the allowed frequency, during tge', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'buyTokens', beneficiary: 2, account: 4, eth: 100 },
  //       { type: 'waitTime','seconds':duration.minutes(5)},
  //       { type: 'buyTokens', beneficiary: 2, account: 4, eth: 100 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // // CROWDSALE TESTS
  // it('does not fail on some specific examples', async function() {

  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'sendTransaction','account':3,'beneficiary':0,'eth':1}
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 1, tokensSold: 0, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 7
  //     }
  //   });

  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'waitTime','seconds':duration.days(2.6)},
  //       { type:'pauseCrowdsale','pause':true,'fromAccount':8},
  //       { type:'sendTransaction','account':0,'beneficiary':9,'eth':39}
  //     ],
  //     crowdsale: {
  //       initialRate: 30, preferentialRate: 33,
  //       foundationWallet: 8, goal: 50, cap: 60,
  //       minInvest: 6000, maxInvest: 48000, owner: 9
  //     }
  //   });

  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { 'type':'fundCrowdsaleBelowCap','account':7,'finalize':false}
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 360000000, owner: 0
  //     }
  //   });
  // });

  // it('calculates correct rate as long as tokens are sold', async function() {
  //   let crowdsaleAndCommands = {
  //     commands: [
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 60001 },
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'buyTokens', beneficiary: 3, account: 3, eth: 100000 },
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 150000 },
  //       { type: 'checkRate', fromAccount: 3 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 2400000000, owner: 0
  //     }
  //   };

  //   await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
  // });

  // it('executes a normal TGE fine', async function() {
  //   let crowdsaleAndCommands = {
  //     commands: [
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 40000 },
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 23000 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 50000 },
  //       { type: 'finalizeCrowdsale', fromAccount: 0 }
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   };

  //   await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
  // });

  // it('should handle the exception correctly when trying to pause the token during and after the crowdsale', async function() {
  //   let crowdsaleAndCommands = {
  //     commands: [
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'pauseToken', 'pause':true, 'fromAccount':0 },
  //       { type: 'pauseToken', 'pause':false, 'fromAccount':0 },
  //       { type: 'pauseToken', 'pause':true, 'fromAccount':0 },
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 60000 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'finalizeCrowdsale', fromAccount: 0 },
  //       { type: 'pauseToken', 'pause':false, 'fromAccount':0 }
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   };

  //   await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
  // });

  // it('should run the fund and finalize crowdsale command fine', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       {'type':'fundCrowdsaleBelowCap','account':0,'finalize':true}
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 360000000, owner: 0
  //     }
  //   });
  // });

  // it('should run the fund crowdsale below cap without finalize command fine', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       {'type':'fundCrowdsaleBelowCap','account':0,'finalize':false}
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 360000000, owner: 0
  //     }
  //   });
  // });

  //CHECK BELOW TESTS!
  // it('should handle fund, finalize and burn with 0 tokens', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       {'type':'fundCrowdsaleBelowSoftCap','account':3,'finalize':true},
  //       {'type':'burnTokens','account':4,'tokens':0}
  //     ],
  //     crowdsale: {
  //       rate1: 11, rate2: 13, foundationWallet: 3, foundersWallet: 2,
  //       setWeiLockSeconds: 2273, owner: 1
  //     }
  //   });
  // });

  // it('should run the fund over soft cap and finalize crowdsale command fine', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       {'type':'fundCrowdsaleOverSoftCap','account':3,'softCapExcessWei':10,'finalize':true}
  //     ],
  //     crowdsale: {
  //       rate1: 20, rate2: 46,
  //       foundationWallet: 4, foundersWallet: 2,
  //       setWeiLockSeconds: 521, owner: 0
  //     }
  //   });
  // });

  // it('should run fund and finalize crowdsale below cap, the burn tokens fine', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       {'type':'fundCrowdsaleBelowSoftCap','account':8,'finalize':true},
  //       {'type':'burnTokens','account':5,'tokens':44}
  //     ],
  //     crowdsale: {
  //       rate1: 1, rate2: 6, foundationWallet: 5, foundersWallet: 2, setWeiLockSeconds: 2176, owner: 10
  //     }
  //   });
  // });

  // it('should run the fund and finalize below and over soft cap sequence fine', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       {'type':'fundCrowdsaleBelowSoftCap','account':3,'finalize':false},
  //       {'type':'fundCrowdsaleOverSoftCap','account':10,'softCapExcessWei':15,'finalize':false}
  //     ],
  //     crowdsale: {
  //       rate1: 26, rate2: 28, foundationWallet: 9, foundersWallet: 2,
  //       setWeiLockSeconds: 2696, owner: 6
  //     }
  //   });
  // });
  //CHECK UNTIL HERE

  it('distributes tokens correctly on any combination of bids', async function() {
    // stateful prob based tests can take a long time to finish when shrinking...
    this.timeout(GEN_TESTS_TIMEOUT * 1000);

    let property = jsc.forall(crowdsaleTestInputGen, async function(crowdsaleAndCommands) {
      return await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    return jsc.assert(property, {tests: GEN_TESTS_QTY});
  });

  // //REFUNDABLE TESTS
  // it('should have vault state set to Active when crowdsale is finished and did not reach the goal', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 50000 },
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'finalizeCrowdsale', fromAccount: 0 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should refund investor if crowdsale did not reach the goal and if he asks to', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 50000, gasPrice: 0 },
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'finalizeCrowdsale', fromAccount: 0 },
  //       { type: 'claimRefund', fromAccount: 4, investedEth: 50000 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // //WHITELIST TESTS
  // it('should allow whitelisted investors to buy tokens during pre crowdsale', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 1 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 1 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 1 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should NOT allow whitelisted investors to buy tokens before pre crowdsale', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'addToWhitelist', whitelistedAccount: 3, fromAccount: 0 },
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 60000 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should NOT allow whitelisted investors to buy tokens at reduced price during crowdsale', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'checkRate', fromAccount: 3 },
  //       { type: 'addToWhitelist', whitelistedAccount: 3, fromAccount: 0 },
  //       { type: 'waitTime','seconds':duration.days(3)},
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 60000 },
  //       { type: 'checkRate', fromAccount: 3 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should NOT add special rate to whitelisted investor if pre TGE has already started', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'setBuyerRate', rate: 15000, whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'checkRate', fromAccount: 4 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('should NOT add special rate to a non-whitelisted investor', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'setBuyerRate', rate: 15000, whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'checkRate', fromAccount: 4 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('whitelisted investor should be able to buy at special rate', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'setBuyerRate', rate: 15000, whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'buyTokens', beneficiary: 4, account: 4, eth: 5000 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('whitelisted investor should NOT be able to buy at special rate but preferential', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'setBuyerRate', rate: 15000, whitelistedAccount: 4, fromAccount: 0 },
  //       { type: 'buyTokens', beneficiary: 4, account: 4, eth: 5000 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('owner should be able to change wallet', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'setWallet', newAccount: 4, fromAccount: 0 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

  // it('non-owner should not be able to change wallet', async function () {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'setWallet', newAccount: 4, fromAccount: 1 },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000,
  //       minInvest: 6000, maxInvest: 48000, owner: 0
  //     }
  //   });
  // });

});
