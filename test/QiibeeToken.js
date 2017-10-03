var help = require('./helpers');
// var _ = require('lodash');

var BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

var QiibeeToken = artifacts.require('./QiibeeToken.sol');
// var Message = artifacts.require('./Message.sol');

const LOG_EVENTS = true;

contract('qiibeeToken', function(accounts) {

  var token;
  var eventsWatcher;

  beforeEach(async function() {
    const initialRate = 6000;
    const preferentialRate = 8000;
    const goal = 360000000;
    const cap = 2400000000;

    const crowdsale = await help.simulateCrowdsale(
      initialRate,
      preferentialRate,
      new BigNumber(help.qbx2sqbx(goal)),
      new BigNumber(help.qbx2sqbx(cap)),
      accounts,
      [40,30,20,10,0]
    );
    token = QiibeeToken.at(await crowdsale.token());

    //TODO: do we need to add something else here? PrivatePresale? Whitelist?
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

  // _.forEach([0, 1], function(tokens) {
  //   it('should return correct balances after transferData with ' + tokens + ' tokens and show the event on receiver contract', async function() {
  //     let message = await Message.new();
  //     help.abiDecoder.addABI(Message._json.abi);

  //     let data = message.contract.showMessage.getData(web3.toHex(123456), 666, 'Transfer Done');

  //     let transaction = await token.transferData(message.contract.address, help.qbx2sqbx(tokens), data, {from: accounts[1]});
  //     let decodedEvents = help.abiDecoder.decodeLogs(transaction.receipt.logs);

  //     assert.equal(2, decodedEvents.length);
  //     assert.equal(data, decodedEvents[1].events[3].value);

  //     assert.equal(help.qbx2sqbx(tokens), await token.balanceOf(message.contract.address));

  //     await help.checkToken(token, accounts, 125, [40 - tokens,30,20,10,0]);
  //   });
  // });

  // it('should return correct balances after transferDataFrom and show the event on receiver contract', async function() {
  //   let message = await Message.new();
  //   help.abiDecoder.addABI(Message._json.abi);

  //   let data = message.contract.showMessage.getData(web3.toHex(123456), 666, 'Transfer Done');

  //   await token.approve(accounts[2], help.qbx2sqbx(2), {from: accounts[1]});

  //   let transaction = await token.transferDataFrom(accounts[1], message.contract.address, help.qbx2sqbx(1), data, {from: accounts[2]});
  //   let decodedEvents = help.abiDecoder.decodeLogs(transaction.receipt.logs);

  //   assert.equal(2, decodedEvents.length);
  //   assert.equal(data, decodedEvents[1].events[3].value);
  //   assert.equal('0x1e24000000000000000000000000000000000000000000000000000000000000', decodedEvents[0].events[0].value);
  //   assert.equal(666, decodedEvents[0].events[1].value);
  //   assert.equal('Transfer Done', decodedEvents[0].events[2].value);
  //   assert.equal(help.qbx2sqbx(1), await token.balanceOf(message.contract.address));

  //   await help.checkToken(token, accounts, 125, [39,30,20,10,0]);
  // });

  // it('should return correct balances after approve and show the event on receiver contract', async function() {
  //   let message = await Message.new();
  //   help.abiDecoder.addABI(Message._json.abi);

  //   let data = message.contract.showMessage.getData(web3.toHex(123456), 666, 'Transfer Done');

  //   let transaction = await token.approveData(message.contract.address, help.qbx2sqbx(1000), data, {from: accounts[1]});
  //   let decodedEvents = help.abiDecoder.decodeLogs(transaction.receipt.logs);

  //   assert.equal(2, decodedEvents.length);
  //   assert.equal(data, decodedEvents[1].events[3].value);

  //   new BigNumber(help.qbx2sqbx(1000)).should.be.bignumber.equal(await token.allowance(accounts[1], message.contract.address));

  //   await help.checkToken(token, accounts, 125, [40,30,20,10,0]);
  // });

  // it('should fail on approveData when spender is the same qiibeeToken contract', async function() {
  //   let data = token.contract.approve.getData(accounts[5], help.qbx2sqbx(666));

  //   try {
  //     await token.approveData(token.contract.address, help.qbx2sqbx(1000), data, {from: accounts[1]});
  //     assert(false, 'approveData should have thrown because the spender should not be the qiibeeToken itself');
  //   } catch(e) {
  //     if (!help.isInvalidOpcodeEx(e)) throw e;
  //   }
  // });

  // it('should fail inside approveData and not trigger ApproveData event', async function() {
  //   let message = await Message.new();
  //   help.abiDecoder.addABI(Message._json.abi);

  //   let data = message.contract.fail.getData();

  //   let transaction = await token.approveData(
  //     message.contract.address, help.qbx2sqbx(10), data,
  //     {from: accounts[1]}
  //   );

  //   let decodedEvents = help.abiDecoder.decodeLogs(transaction.receipt.logs);
  //   assert.equal(0, decodedEvents.length);

  //   new BigNumber(help.qbx2sqbx(10)).should.be.bignumber
  //     .equal(await token.allowance(accounts[1], message.contract.address));

  //   await help.checkToken(token, accounts, 125, [40,30,20,10,0]);
  // });

  // it('should fail inside transferData and not trigger TransferData event', async function() {
  //   let message = await Message.new();
  //   help.abiDecoder.addABI(Message._json.abi);

  //   let data = message.contract.fail.getData();

  //   let transaction = await token.transferData(
  //     message.contract.address, help.qbx2sqbx(10), data,
  //     {from: accounts[1]}
  //   );

  //   let decodedEvents = help.abiDecoder.decodeLogs(transaction.receipt.logs);
  //   assert.equal(0, decodedEvents.length);

  //   new BigNumber(help.qbx2sqbx(10)).should.be.bignumber
  //     .equal(await token.balanceOf(message.contract.address));

  //   await help.checkToken(token, accounts, 125, [30,30,20,10,0]);
  // });

  // it('should fail inside transferDataFrom and not trigger TransferData event', async function() {
  //   let message = await Message.new();
  //   help.abiDecoder.addABI(Message._json.abi);

  //   let data = message.contract.fail.getData();

  //   await token.approve(accounts[1], help.qbx2sqbx(10), {from: accounts[2]});

  //   let transaction = await token.transferDataFrom(
  //     accounts[2], message.contract.address, help.qbx2sqbx(10), data,
  //     {from: accounts[1]}
  //   );

  //   let decodedEvents = help.abiDecoder.decodeLogs(transaction.receipt.logs);
  //   assert.equal(0, decodedEvents.length);

  //   new BigNumber(help.qbx2sqbx(10)).should.be.bignumber
  //     .equal(await token.balanceOf(message.contract.address));

  //   await help.checkToken(token, accounts, 125, [40,20,20,10,0]);
  // });

  // it('should fail transferData when using qiibeeToken contract address as receiver', async function() {

  //   try {
  //     await token.transferData(token.contract.address, help.qbx2sqbx(1000), web3.toHex(0), {from: accounts[1]});
  //     assert(false, 'transferData should have thrown');
  //   } catch (error) {
  //     if (!help.isInvalidOpcodeEx(error)) throw error;
  //   }

  //   await help.checkToken(token, accounts, 125, [40,30,20,10,0]);
  // });

  // it('should fail transferDataFrom when using qiibeeToken contract address as receiver', async function() {

  //   await token.approve(accounts[1], help.qbx2sqbx(1), {from: accounts[3]});

  //   try {
  //     await token.transferDataFrom(accounts[3], token.contract.address, help.qbx2sqbx(1), web3.toHex(0), {from: accounts[1]});
  //     assert(false, 'transferDataFrom should have thrown');
  //   } catch (error) {
  //     if (!help.isInvalidOpcodeEx(error)) throw error;
  //   }

  //   await help.checkToken(token, accounts, 125, [40,30,20,10,0]);
  // });

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
