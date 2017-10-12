var _ = require('lodash');
var colors = require('colors');
var jsc = require('jsverify');

var BigNumber = web3.BigNumber;

var help = require('./helpers');
var latestTime = require('./helpers/latestTime');

var QiibeePresale = artifacts.require('./QiibeePresale.sol');

let gen = require('./generators');
let commands = require('./commands');

const LOG_EVENTS = true;

let GEN_TESTS_QTY = parseInt(process.env.GEN_TESTS_QTY);
if (isNaN(GEN_TESTS_QTY))
  GEN_TESTS_QTY = 50;

let GEN_TESTS_TIMEOUT = parseInt(process.env.GEN_TESTS_TIMEOUT);
if (isNaN(GEN_TESTS_TIMEOUT))
  GEN_TESTS_TIMEOUT = 240;

contract('QiibeePresale Property-based test', function(accounts) {

  const zero = new BigNumber(0);

  let presaleTestInputGen = jsc.record({
    commands: jsc.array(jsc.nonshrink(commands.presaleCommandsGen)),
    presale: jsc.nonshrink(gen.presaleGen)
  });

  let sumBigNumbers = (arr) => _.reduce(arr, (accum, x) => accum.plus(x), zero);

  let checkPresaleState = async function(state, presaleData, presale) {

    assert.equal(state.wallet, await presale.wallet());
    assert.equal(state.crowdsalePaused, await presale.paused());

    help.debug(colors.yellow('checking purchases total wei, purchases:', JSON.stringify(state.purchases)));

    let weiInPurchases = sumBigNumbers(_.map(state.purchases, (p) => p.wei));
    weiInPurchases.should.be.bignumber.equal(await presale.weiRaised());

  };

  let runGeneratedPresaleAndCommands = async function(input) {
    let { cap, owner} = input.presale,
      ownerAddress = gen.getAccount(owner),
      foundationWallet = gen.getAccount(input.presale.foundationWallet);

    let shouldThrow = (cap == 0) ||
      (foundationWallet == 0) ||
      (ownerAddress == 0);

    var eventsWatcher;

    try {
      let presaleData = {
        cap: new BigNumber(help.toAtto(input.presale.cap)),
        foundationWallet: gen.getAccount(input.presale.foundationWallet),
      };

      let presale = await QiibeePresale.new(
        presaleData.cap,
        presaleData.foundationWallet,
        {from: ownerAddress}
      );

      assert.equal(false, shouldThrow, 'create Presale should have thrown but it did not');

      eventsWatcher = presale.allEvents();
      eventsWatcher.watch(function(error, log){
        if (LOG_EVENTS)
          console.log('Event:', log.event, ':',log.args);
      });

      help.debug(colors.yellow('created presale at address ', presale.address));

      var state = {
        presaleData: presaleData,
        crowdsaleContract: presale,
        balances: {},
        ethBalances: help.getAccountsBalances(accounts),
        purchases: [],
        weiRaised: zero,
        crowdsalePaused: true,
        owner: owner,
        whitelist: [],
        wallet: presaleData.foundationWallet
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

  // PRESALE TESTS
  it('distributes tokens correctly on any combination of bids', async function() {
    // stateful prob based tests can take a long time to finish when shrinking...
    this.timeout(GEN_TESTS_TIMEOUT * 1000);

    let property = jsc.forall(presaleTestInputGen, async function(presaleAndCommands) {
      return await runGeneratedPresaleAndCommands(presaleAndCommands);
    });

    return jsc.assert(property, {tests: GEN_TESTS_QTY});
  });

  // //WHITELIST TESTS
  it('should allow whitelisted investors to invest', async function () {
    await runGeneratedPresaleAndCommands({
      commands: [
        { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
        { type: 'presaleSendTransaction', beneficiary: 3, account: 4, eth: 1 },
        { type: 'pauseCrowdsale', 'pause':false, 'fromAccount':0},
        { type: 'presaleSendTransaction', beneficiary: 3, account: 4, eth: 1 },
      ],
      presale: {
        cap: 100, foundationWallet: 10, owner: 0
      }
    });
  });

  it('should NOT allow non-whitelisted investors to invest', async function () {
    await runGeneratedPresaleAndCommands({
      commands: [
        { type: 'presaleSendTransaction', beneficiary: 3, account: 4, eth: 1 },
        { type: 'pauseCrowdsale', 'pause':false, 'fromAccount':0},
        { type: 'presaleSendTransaction', beneficiary: 3, account: 4, eth: 1 },
      ],
      presale: {
        cap: 100, foundationWallet: 10, owner: 0
      }
    });
  });

  it('should NOT be able to add investor to whitelist if not owner', async function () {
    await runGeneratedPresaleAndCommands({
      commands: [
        { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 2 },
      ],
      presale: {
        cap: 100, foundationWallet: 10, owner: 0
      }
    });
  });

  it('should NOT be able to invest if cap has been reached', async function () {
    await runGeneratedPresaleAndCommands({
      commands: [
        { type: 'addToWhitelist', whitelistedAccount: 4, fromAccount: 0 },
        { type: 'pauseCrowdsale', 'pause':false, 'fromAccount':0},
        { type: 'presaleSendTransaction', account: 4, eth: 80 },
        { type: 'presaleSendTransaction', account: 4, eth: 30 }
      ],
      presale: {
        cap: 100, foundationWallet: 10, owner: 0
      }
    });
  });

});
