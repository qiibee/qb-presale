var _ = require('lodash');
var colors = require('colors');
var jsc = require('jsverify');

var BigNumber = web3.BigNumber;
BigNumber.config({ DECIMAL_PLACES: 18 });

var help = require('./helpers');
var latestTime = require('./helpers/latestTime');
var {increaseTimeTestRPC, duration} = require('./helpers/increaseTime');

var QiibeeToken = artifacts.require('QiibeeToken.sol');
var QiibeeCrowdsale = artifacts.require('QiibeeCrowdsale.sol');
var Vault = artifacts.require('Vault.sol');

let gen = require('./generators');
let commands = require('./commands');

const LOG_EVENTS = false;

let GEN_TESTS_QTY = parseInt(process.env.GEN_TESTS_QTY);
if (isNaN(GEN_TESTS_QTY))
  GEN_TESTS_QTY = 100;

let GEN_TESTS_TIMEOUT = parseInt(process.env.GEN_TESTS_TIMEOUT);
if (isNaN(GEN_TESTS_TIMEOUT)) GEN_TESTS_TIMEOUT = 480;

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
    tokensInPurchases.should.be.bignumber.equal(help.fromAtto(state.tokensSold));
    tokensInPurchases.should.be.bignumber.equal(help.fromAtto(await crowdsale.tokensSold()));

    let weiInPurchases = sumBigNumbers(_.map(state.purchases, (p) => p.wei));
    weiInPurchases.should.be.bignumber.equal(state.weiRaised);
    weiInPurchases.should.be.bignumber.equal(await crowdsale.weiRaised());
    assert.equal(state.crowdsaleFinalized, await crowdsale.isFinalized());

    help.debug(colors.blue('TOKENS MINTED:', state.tokensSold));
    help.debug(colors.blue('WEI RAISED:', state.weiRaised));
    help.debug(colors.blue('CROWDSALE STATUS:', state.crowdsalePaused ? 'PAUSED' : 'FINALIZED'));

    let vault = Vault.at(await state.crowdsaleContract.vault());
    if (state.crowdsaleFinalized) {
      help.fromAtto(state.tokenSupply).should.be.bignumber.equal(help.fromAtto(await state.token.totalSupply()));
      for (var i = 0; i < state.vault.length; i++) {
        new BigNumber(0).should.be.bignumber.equal(await vault.deposited(gen.getAccount(i)));
      }
    } else {
      for (i = 0; i < state.vault.length; i++) {
        if (state.vault[i])
          new BigNumber(state.vault[i]).should.be.bignumber.equal(await vault.deposited(gen.getAccount(i)));
      }
    }

    help.fromAtto(state.crowdsaleSupply).should.be.bignumber.equal(
      help.fromAtto(await state.crowdsaleContract.tokensSold())
    );
  };

  let eventsWatcher;

  let runGeneratedCrowdsaleAndCommands = async function(input) {

    await increaseTimeTestRPC(60);
    let startTime = latestTime() + duration.days(1);
    let endTime = startTime + duration.days(10);

    help.debug(colors.yellow('crowdsaleTestInput data:\n', JSON.stringify(input), startTime, endTime));

    let {rate, cap, minInvest, maxCumulativeInvest, maxGasPrice, owner, foundationWallet} = input.crowdsale,
      ownerAddress = gen.getAccount(input.crowdsale.owner),
      migrationMaster = gen.getAccount(foundationWallet);
    foundationWallet = gen.getAccount(foundationWallet);

    let shouldThrow = (ownerAddress === help.zeroAddress) ||
      migrationMaster === help.zeroAddress;

    let token;
    try {
      token = await QiibeeToken.new(migrationMaster, {from: ownerAddress});
      await token.pause({from: ownerAddress});
      assert.equal(false, shouldThrow, 'create Crowdsale should have thrown but it did not');
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

    shouldThrow = (rate == 0) ||
      (latestTime() >= startTime) ||
      (startTime >= endTime) ||
      (rate == 0) ||
      (cap == 0) ||
      (minInvest == 0) ||
      (maxCumulativeInvest == 0) ||
      (minInvest > maxCumulativeInvest) ||
      (minInvest >= cap) ||
      (maxGasPrice == 0) ||
      (ownerAddress == 0 || ownerAddress === help.zeroAddress) ||
      (token == 0) ||
      (foundationWallet == 0 || foundationWallet === help.zeroAddress);

    try {

      let crowdsaleData = {
        startTime: startTime,
        endTime: endTime,
        rate: input.crowdsale.rate,
        cap: new BigNumber(help.toWei(cap)),
        minInvest: new BigNumber(help.toWei(minInvest)),
        maxCumulativeInvest: new BigNumber(help.toWei(maxCumulativeInvest)),
        maxGasPrice: new BigNumber(maxGasPrice),
        token: token.address,
        foundationWallet: gen.getAccount(input.crowdsale.foundationWallet),
      };

      let crowdsale = await QiibeeCrowdsale.new(
        crowdsaleData.startTime,
        crowdsaleData.endTime,
        crowdsaleData.rate,
        crowdsaleData.cap,
        crowdsaleData.minInvest,
        crowdsaleData.maxCumulativeInvest,
        crowdsaleData.maxGasPrice,
        crowdsaleData.token,
        crowdsaleData.foundationWallet,
        {from: ownerAddress}
      );

      assert.equal(false, shouldThrow, 'create Crowdsale should have thrown but it did not');

      //set token to presale
      // await crowdsale.setToken(token.address, {from: ownerAddress});
      await token.transferOwnership(crowdsale.address,{ from: ownerAddress});

      eventsWatcher = crowdsale.allEvents();
      eventsWatcher.watch(function(error, log){
        if (LOG_EVENTS)
          console.log('Event:', log.event, ':',log.args);
      });

      help.debug(colors.yellow('created crowdsale at address ', crowdsale.address));

      let state = {
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
        wallet: input.crowdsale.foundationWallet,
        passedKYC: [],
        vault: [],
        bonus: [],
        tokenSupply: zero,
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

  // afterEach(function(done) {
  //   if (eventsWatcher) {
  //     eventsWatcher.stopWatching();
  //   }
  //   done();
  // });

  describe('limit tests', function () {

    it('should NOT buy tokens if amount exceeds the cap', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'fundCrowdsaleToCap', account: 0, finalize:false},
          { type: 'waitTime','seconds':duration.minutes(12)},
          { type: 'buyTokens', beneficiary: 4, account: 4, eth: 205000 },
        ],
        crowdsale:
        {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 250000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should NOT buy tokens if amount is below the min limit', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 0.5 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should buy tokens if amount is within the limits', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 101 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 100, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should NOT buy tokens if amount exceeds the max limit', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 10 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 10 },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 28 },
          // { type: 'buyTokens', beneficiary: 3, account: 3, eth: 1 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 1, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should NOT buy tokens if cap has been reached', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'fundCrowdsaleToCap','account': 0,'finalize': false},
          { type: 'buyTokens', beneficiary: 2, account: 2, eth: 6000 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

  });

  describe('SPAM prevention tests', function () {

    it('should NOT buy tokens with exceeding gasPrice limit', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 1, gasPrice: 50000000001 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

  });

  describe('crowdsale tests', function () {

    it('does not fail on some specific examples', async function() {

      // await runGeneratedCrowdsaleAndCommands({
      //   commands: [
      //     { type: 'waitTime','seconds':duration.days(1)},
      //     { type: 'sendTransaction','account':3,'beneficiary':0,'eth':7000}
      //   ],
      //   crowdsale: {
      //     rate: 6000, cap: 240000,
      //     minInvest: 6000, maxCumulativeInvest: 48000,
      //     maxGasPrice: 50000000000,
      //     owner: 0, foundationWallet: 10
      //   }
      // });

      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 'zero', account: 2, eth: 1 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });

      // await runGeneratedCrowdsaleAndCommands({
      //   commands: [
      //     { type: 'waitTime','seconds':duration.days(1)},
      //     { type:'pauseCrowdsale','pause':true,'fromAccount':8},
      //     { type:'sendTransaction','account':0,'beneficiary':9,'eth':39}
      //   ],
      //   crowdsale: {
      //     rate: 6000, cap: 240000,
      //     minInvest: 6000, maxCumulativeInvest: 48000,
      //     maxGasPrice: 50000000000,
      //     owner: 0, foundationWallet: 10
      //   }
      // });

      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { 'type':'fundCrowdsaleToCap','account':7,'finalize':false}
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('executes a normal TGE fine', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'buyTokens', beneficiary: 4, account: 4, eth: 7000 },
          { type: 'validatePurchase', account: 0, beneficiary: 4, acceptance: true },
          { type: 'validatePurchase', account: 0, beneficiary: 5, acceptance: true },
          { type: 'buyTokens', beneficiary: 5, account: 5, eth: 7000 },
          { type: 'waitTime','seconds':duration.days(10)},
          { type: 'buyTokens', beneficiary: 6, account: 6, eth: 60000 },
          { type: 'finalizeCrowdsale', fromAccount: 0 }
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 100, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('can invest several times and then be accepted by KYC', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 7000 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 100, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('if cap was still not reached and purchase goes over the cap, accept until cap is reached', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'buyTokens', beneficiary: 4, account: 4, eth: 6000 },
          { type: 'buyTokens', beneficiary: 5, account: 5, eth: 7000 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'validatePurchase', account: 0, beneficiary: 4, acceptance: true },
          { type: 'validatePurchase', account: 0, beneficiary: 5, acceptance: true },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 200, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('if cap was still not reached and purchase goes over the cap, accept until cap is reached, version 2', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'validatePurchase', account: 0, beneficiary: 2, acceptance: true },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'buyTokens', beneficiary: 2, account: 2, eth: 6000 },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 8000 },
        ],
        crowdsale: {
          rate: 6000, cap: 19000,
          minInvest: 100, maxCumulativeInvest: 19000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

  });

  describe('validation tests', function () {

    it('cannot validate purchase if not owner', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'validatePurchase', account: 1, beneficiary: 3, acceptance: true },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };
      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('can validate to true investor that was already validated to true', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };
      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('can validate to false investor that was already validated to true', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: false },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };
      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('can validate to false investor that was already validated to false', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: false },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };
      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('can validate even though crowdsale time has ended', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'waitTime','seconds':duration.days(15)},
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: false },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };
      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

  });

  describe('bonus', function () {

    it('buying and validating during first week should give %5 bonus', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'buyTokens', beneficiary: 4, account: 4, eth: 6000 },
          { type: 'buyTokens', beneficiary: 4, account: 4, eth: 6000 },
          { type: 'validatePurchase', account: 0, beneficiary: 4, acceptance: true },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('buying during first week and validating afterwards should give %5 bonus', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'waitTime','seconds':duration.days(9)},
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('buying during second week should NOT give %5 bonus', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(9)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    //TODO: we know that his is a bug...
    // it('buying during 1st and 2nd week. Validating afterwards should give %5 bonus to the first purchase', async function() {
    //   let crowdsaleAndCommands = {
    //     commands: [
    //       { type: 'waitTime','seconds':duration.days(1)},
    //       { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
    //       { type: 'waitTime','seconds':duration.days(9)},
    //       { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
    //       { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
    //     ],
    //     crowdsale: {
    //       rate: 6000, cap: 240000,
    //       minInvest: 6000, maxCumulativeInvest: 48000,
    //       maxGasPrice: 50000000000,
    //       owner: 0, foundationWallet: 10
    //     }
    //   };

    //   await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    // });

    it('bonus is reset on 2nd week if it was true on first week. Should NOT receive bonus on 2nd.', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'waitTime','seconds':duration.days(9)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

  });

  describe('refund tests', function () {

    it('investor must receive refund if invested and he was then rejected by KYC', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: false },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('investor must receive refund if he was rejected by KYC and then tries to invest', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: false },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('investor must receive partial refund if his investment goes partially over the cap', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds':duration.days(1)},
          { type: 'validatePurchase', account: 0, beneficiary: 3, acceptance: true },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 100000 },
          { type: 'validatePurchase', account: 0, beneficiary: 4, acceptance: true },
          { type: 'buyTokens', beneficiary: 4, account: 0, eth: 150000 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('remaining funds after crowdsale is finished should be refunded to all the contributors', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds': duration.days(1)},
          { type: 'buyTokens', beneficiary: 2, account: 2, eth: 6000 },
          { type: 'buyTokens', beneficiary: 3, account: 3, eth: 6000 },
          { type: 'buyTokens', beneficiary: 4, account: 4, eth: 6000 },
          { type: 'buyTokens', beneficiary: 5, account: 5, eth: 6000 },
          { type: 'buyTokens', beneficiary: 6, account: 6, eth: 6000 },
          { type: 'fundCrowdsaleToCap','account': 0,'finalize': false},
          { type: 'waitTime','seconds': duration.days(10)},
          { type: 'finalizeCrowdsale', fromAccount: 0 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
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
          { type: 'pauseToken', 'pause': true, 'fromAccount': 0 },
          { type: 'pauseToken', 'pause': false, 'fromAccount': 0 },
          { type: 'waitTime','seconds': duration.days(10)},
          { type: 'finalizeCrowdsale', fromAccount: 0 },
          { type: 'pauseToken', 'pause': false, 'fromAccount': 0 },
          { type: 'pauseToken', 'pause': true, 'fromAccount':10 }
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('should pause or handle exceptions fine', async function() {
      let crowdsaleAndCommands = {
        commands: [
          { type: 'waitTime','seconds': duration.days(3)},
          { type: 'finalizeCrowdsale', fromAccount: 0 },
          { type: 'pauseToken', 'pause': false, 'fromAccount': 0 },
          { type: 'pauseToken', 'pause': true, 'fromAccount': 0 },
          { type: 'pauseToken', 'pause': true, 'fromAccount': 10 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
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
          { type: 'finalizeCrowdsale', fromAccount: 0 },
          { type: 'waitTime','seconds':duration.days(10)},
          { type: 'finalizeCrowdsale', fromAccount: 0 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      };

      await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
    });

    it('should run the fund and finalize crowdsale command fine', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleToCap','account': 0,'finalize': true}
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should run the fund crowdsale below cap without finalize command fine', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleToCap','account':0,'finalize':false}
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should handle exception fine when trying to finalize and is already finalized', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleToCap','account':0,'finalize':true},
          { type: 'finalizeCrowdsale','fromAccount':0}
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should handle exception fine when trying to finalize not being an owner', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleToCap','account':0,'finalize':true},
          { type: 'finalizeCrowdsale','fromAccount':1}
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should distribute 49% of tokens to foundation', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleToCap', 'account': 0, 'finalize': false},
          { type: 'waitTime','seconds':duration.days(15)},
          { type: 'finalizeCrowdsale', 'fromAccount': 0}
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

  });

  describe('burn tokens tests', function () {
    it('should handle fund, finalize and burn with 0 tokens', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleToCap','account':0,'finalize':true},
          { type: 'burnTokens','account':4,'tokens':0}
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });

    it('should run fund and finalize crowdsale below cap, then burn tokens fine', async function() {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'fundCrowdsaleToCap','account':0,'finalize':true},
          { type: 'burnTokens','account':5,'tokens':44} //TODO: fix! should be owner
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 240000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });
  });

  it('distributes tokens correctly on any combination of bids', async function() {
    // stateful prob based tests can take a long time to finish when shrinking...
    this.timeout(GEN_TESTS_TIMEOUT * 1000);
    if (GEN_TESTS_QTY > 0) {
      let property = jsc.forall(crowdsaleTestInputGen, async function(crowdsaleAndCommands) {
        let result = await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
        if (result) {
          help.debug(colors.green('Test result: OK'));
        } else {
          help.debug(colors.red('Test result: FAIL'));
        }
        return result;
      });
      console.log('Generative tests to run:', GEN_TESTS_QTY);
      console.log('Running tests...');
      return jsc.assert(property, {tests: GEN_TESTS_QTY});
    } else {
      console.log(' Skipping test...');
    }
  });

  describe('ownership tests', function () {
    it('owner should be able to change wallet', async function () {
      await runGeneratedCrowdsaleAndCommands({
        commands: [
          { type: 'setWallet', newAccount: 4, fromAccount: 0 },
        ],
        crowdsale: {
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
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
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
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
          rate: 6000, cap: 240000,
          minInvest: 6000, maxCumulativeInvest: 48000,
          maxGasPrice: 50000000000,
          owner: 0, foundationWallet: 10
        }
      });
    });
  });
});
