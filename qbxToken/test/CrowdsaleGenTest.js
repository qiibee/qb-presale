var _ = require('lodash');
var jsc = require('jsverify');

var BigNumber = web3.BigNumber;

var help = require('./helpers');
var latestTime = require('./helpers/latestTime');
var {increaseTimeTestRPC, duration} = require('./helpers/increaseTime');

var QiibeeToken = artifacts.require('./QiibeeToken.sol');
var QiibeeCrowdsale = artifacts.require('./QiibeeCrowdsale.sol');
var RefundVault = artifacts.require('zeppelin-solidity/contracts/crowdsale/Crowdsale.sol');

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

  let crowdsaleTestInputGen = jsc.record({
    commands: jsc.array(jsc.nonshrink(commands.commandsGen)),
    crowdsale: jsc.nonshrink(gen.crowdsaleGen)
  });

  let sumBigNumbers = (arr) => _.reduce(arr, (accum, x) => accum.plus(x), zero);

  let checkCrowdsaleState = async function(state, crowdsaleData, crowdsale) {
    // assert.equal(state.crowdsalePaused, await crowdsale.token().paused()); //TODO: ask Augusto why they have a Pausable crowdsale
    let tokensInPurchases = sumBigNumbers(_.map(state.purchases, (p) => p.tokens));
    tokensInPurchases.should.be.bignumber.equal(help.sqbx2qbx(await crowdsale.tokensSold())); //TODO: check if conver everythign to QBX
    // let presaleWei = sumBigNumbers(_.map(state.presalePurchases, (p) => p.wei));
    // presaleWei.should.be.bignumber.equal(await crowdsale.totalPresaleWei.call());

    help.debug('checking purchases total wei, purchases:', JSON.stringify(state.purchases));
    let weiInPurchases = sumBigNumbers(_.map(state.purchases, (p) => p.wei));
    weiInPurchases.should.be.bignumber.equal(await crowdsale.weiRaised());

    // Check presale tokens sold
    // state.totalPresaleWei.should.be.bignumber.equal(await crowdsale.totalPresaleWei.call());
    assert.equal(state.crowdsaleFinalized, await crowdsale.isFinalized.call());
    if (state.crowdsaleFinalized) {
      assert.equal(state.goalReached, await crowdsale.goalReached());
      // assert.equal(state.capReached, await crowdsale.capReached()); //TODO: test this!
      //TODO: check revault state is active
      let vault = RefundVault.at(await crowdsale.vault());
      console.log("VAULT: ", await crowdsale.getVaultState());
      console.log("ACOUNT INVESTOR:", gen.getAccount(3))
      // console.log("REVAULT STATE: ", await crowdsale.vault.call());
      await vault.refund.call(gen.getAccount(3)).should.be.rejectedWith(EVMThrow)
      // console.log("REVAULT STATE: ", await crowdsale.vault.call().state());
      // console.log("REVAULT STATE: ", await crowdsale.vault().state());
      // assert.equal(state.revaultState, vault().state());

    }

    //Check that the total supply is equal to TOTAL_SUPPLY tokens
    state.crowdsaleData.TOTAL_SUPPLY.
      should.be.bignumber.equal(await state.token.totalSupply.call());
  };

  let runGeneratedCrowdsaleAndCommands = async function(input) {

    await increaseTimeTestRPC(60);
    let startTimestamp = latestTime() + duration.days(1);
    let endTimestamp = startTimestamp + duration.days(1);
    help.debug('crowdsaleTestInput data:\n', input, startTimestamp, endTimestamp);

    let {initialRate, goal, cap, preferentialRate, owner} = input.crowdsale,
      ownerAddress = gen.getAccount(input.crowdsale.owner),
      foundationWallet = gen.getAccount(input.crowdsale.foundationWallet);

    let shouldThrow = (initialRate == 0) ||
      (latestTime() >= startTimestamp) ||
      (startTimestamp >= endTimestamp) ||
      (preferentialRate == 0) ||
      (goal == 0) ||
      (cap == 0) ||
      (goal >= cap) ||
      (startTimestamp >= endTimestamp) ||
      (ownerAddress == 0) ||
      (foundationWallet == 0);

    var eventsWatcher;

    try {
      let crowdsaleData = {
        startTimestamp: startTimestamp,
        endTimestamp: endTimestamp,
        initialRate: input.crowdsale.initialRate,
        preferentialRate: input.crowdsale.preferentialRate,
        goal: help.qbx2sqbx(input.crowdsale.goal),
        cap: help.qbx2sqbx(input.crowdsale.cap),
        foundationWallet: gen.getAccount(input.crowdsale.foundationWallet),
        TOTAL_SUPPLY: 10000000000000000000000000000,
        FOUNDATION_SUPPLY: 7600000000000000000000000000,
        CROWDSALE_SUPPLY: 2400000000000000000000000000
      };
      let crowdsale = await QiibeeCrowdsale.new(
        crowdsaleData.startTimestamp,
        crowdsaleData.endTimestamp,
        crowdsaleData.initialRate,
        crowdsaleData.preferentialRate,
        crowdsaleData.goal,
        crowdsaleData.cap,
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

      help.debug('created crowdsale at address ', crowdsale.address);

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
        claimedEth: {},
        weiRaised: zero,
        tokensSold: zero,
        // totalPresaleWei: zero,
        crowdsalePaused: false,
        tokenPaused: true,
        crowdsaleFinalized: false,
        // weiPerUSDinTGE: 0,
        goalReached: false,
        owner: owner,
        crowdsaleSupply: zero,
        // MVMBuyPrice: new BigNumber(0),
        // MVMBurnedTokens: new BigNumber(0),
        burnedTokens: zero,
        returnedWeiForBurnedTokens: new BigNumber(0),
        // revaultState:
      };

      for (let commandParams of input.commands) {
        let command = commands.findCommand(commandParams.type);
        try {
          state = await command.run(commandParams, state);
        }
        catch(error) {
          help.debug('An error occurred, block timestamp: ' + latestTime() + '\nError: ' + error);
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

  // it('does not fail on some specific examples that once failed', async function() {

  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type:'sendTransaction','account':3,'beneficiary':0,'eth':1}
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 1, tokensSold: 0, goal: 360000000, cap: 2400000000, owner: 7
  //     }
  //   });

  //   // await runGeneratedCrowdsaleAndCommands({
  //   //   commands: [
  //   //     { type: 'waitTime','seconds':duration.days(2.6)},
  //   //     { type:'pauseCrowdsale','pause':true,'fromAccount':8},
  //   //     { type:'sendTransaction','account':0,'beneficiary':9,'eth':39}
  //   //   ],
  //   //   crowdsale: {
  //   //     initialRate: 30, preferentialRate: 33,
  //   //     foundationWallet: 8, goal: 50, cap: 60, owner: 9
  //   //   }
  //   // });

  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { 'type':'fundCrowdsaleBelowSoftCap','account':7,'finalize':false}
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000, owner: 0
  //     }
  //   });
  // });

  // it('calculates correct rate as long as tokens are sold', async function() {
  //   let crowdsaleAndCommands = {
  //     commands: [
  //       { type: 'checkRate' },
  //       { type: 'buyTokens', beneficiary: 3, account: 2, eth: 4 },
  //       { type: 'checkRate' },
  //     ],
  //     crowdsale: {
  //       initialRate: 6000, preferentialRate: 8000,
  //       foundationWallet: 10, goal: 360000000, cap: 2400000000, owner: 0
  //     }
  //   };

  //   await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
  // });

  it('Execute a normal TGE', async function() {
    let crowdsaleAndCommands = {
      commands: [
        { type: 'checkRate' },
        { type: 'waitTime','seconds':duration.days(1)},
        { type: 'buyTokens', beneficiary: 3, account: 4, eth: 40000 },
        { type: 'waitTime','seconds':duration.days(1)},
        { type: 'buyTokens', beneficiary: 3, account: 4, eth: 23000 },
        { type: 'waitTime','seconds':duration.days(1)},
        { type: 'finalizeCrowdsale', fromAccount: 0 }
      ],
      crowdsale: {
        initialRate: 6000, preferentialRate: 8000,
        foundationWallet: 10, goal: 360000000, cap: 2400000000, owner: 0
      }
    };

    await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
  });

  // it('should handle the exception correctly when trying to pause the token during and after the crowdsale', async function() {
  //   let crowdsaleAndCommands = {
  //     commands: [
  //       { type: 'checkRate' },
  //       { type: 'waitTime','seconds':duration.days(1)},
  //       { type: 'waitTime','seconds':duration.days(0.8)},
  //       { type: 'pauseToken', 'pause':true, 'fromAccount':1 },
  //       { type: 'setWeiPerUSDinTGE', wei: 1500000000000000, fromAccount: 3 },
  //       { type: 'waitTime','seconds':duration.days(1.1)},
  //       { type: 'buyTokens', beneficiary: 3, account: 4, eth: 60000 },
  //       { type: 'waitTime','seconds':duration.days(2)},
  //       { type: 'finalizeCrowdsale', fromAccount: 5 },
  //       { type: 'pauseToken', 'pause':true, 'fromAccount':1 }
  //     ],
  //     crowdsale: {
  //       rate1: 10,
  //       rate2: 9,
  //       privatePresaleRate: 13,
  //       setWeiLockSeconds: 5,
  //       foundationWallet: 2,
  //       owner: 3
  //     }
  //   };

  //   await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
  // });

  // it('should not fail when setting wei for tge before each stage starts', async function() {
  //   // trying multiple commands with different reasons to fail: wrong owner or wei==0

  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       { type:'setWeiPerUSDinTGE','wei':0,'fromAccount':10},
  //       { type:'setWeiPerUSDinTGE','wei':0,'fromAccount':6},
  //       { type:'setWeiPerUSDinTGE','wei':3,'fromAccount':6}
  //     ],
  //     crowdsale: {
  //       rate1: 10, rate2: 31, privatePresaleRate: 35,
  //       foundationWallet: 10, setWeiLockSeconds: 1, owner: 6
  //     }
  //   });
  // });

  // it('should handle the thrown exc. when trying to approve on the paused token', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [{ type:'approve','lif':0,'fromAccount':3,'spenderAccount':5}],
  //     crowdsale: {
  //       rate1: 24, rate2: 15, privatePresaleRate: 15,
  //       foundationWallet: 2, setWeiLockSeconds: 1, owner: 5
  //     }
  //   });
  // });

  // it('should run the fund and finalize crowdsale command fine', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       {'type':'fundCrowdsaleBelowSoftCap','account':3,'finalize':true}
  //     ],
  //     crowdsale: {
  //       rate1: 20, rate2: 46, privatePresaleRate: 0,
  //       foundationWallet: 4, setWeiLockSeconds: 521, owner: 0
  //     }
  //   });
  // });

  // it('should run the fund crowdsale below cap without finalize command fine', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       {'type':'fundCrowdsaleBelowSoftCap','account':3,'finalize':false}
  //     ],
  //     crowdsale: {
  //       rate1: 20, rate2: 46, privatePresaleRate: 0,
  //       foundationWallet: 4, setWeiLockSeconds: 521, owner: 0
  //     }
  //   });
  // });

  // it('should be able to transfer tokens in unpaused token after crowdsale funded over cap', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       {'type':'fundCrowdsaleOverSoftCap','account':10,'softCapExcessWei':4,'finalize':true},
  //       {'type':'transfer','lif':0,'fromAccount':4,'toAccount':2}
  //     ],
  //     crowdsale: {
  //       rate1: 14, rate2: 20, privatePresaleRate: 7,
  //       foundationWallet: 6, setWeiLockSeconds: 83, owner: 5
  //     }
  //   });
  // });

  // it('should run the fund over soft cap and finalize crowdsale command fine', async function() {
  //   await runGeneratedCrowdsaleAndCommands({
  //     commands: [
  //       {'type':'fundCrowdsaleOverSoftCap','account':3,'softCapExcessWei':10,'finalize':true}
  //     ],
  //     crowdsale: {
  //       rate1: 20, rate2: 46, privatePresaleRate: 0,
  //       foundationWallet: 4, setWeiLockSeconds: 521, owner: 0
  //     }
  //   });
  // });

  // it('distributes tokens correctly on any combination of bids', async function() {
  //   // stateful prob based tests can take a long time to finish when shrinking...
  //   this.timeout(GEN_TESTS_TIMEOUT * 1000);

  //   let property = jsc.forall(crowdsaleTestInputGen, async function(crowdsaleAndCommands) {
  //     return await runGeneratedCrowdsaleAndCommands(crowdsaleAndCommands);
  //   });

  //   console.log('Generative tests to run:', GEN_TESTS_QTY);
  //   return jsc.assert(property, {tests: GEN_TESTS_QTY});
  // });

});
