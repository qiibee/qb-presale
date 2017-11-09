var help = require('./helpers');

var BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

var QiibeeToken = artifacts.require('../QiibeeToken.sol');

contract('qiibeeToken', function(accounts) {

  let token;

  beforeEach(async function() {
    token = await QiibeeToken.new();
    await token.mint(accounts[0], web3.toWei(1), {from: await token.owner()});
    await token.mint(accounts[1], web3.toWei(1), {from: await token.owner()});
  });

  it('has name, symbol and decimals', async function() {
    assert.equal('QBX', await token.SYMBOL());
    assert.equal('qiibeeCoin', await token.NAME());
    assert.equal(18, await token.DECIMALS());
  });

  it('can burn tokens', async function() {
    let totalSupply = await token.totalSupply.call();
    new BigNumber(0).should.be.bignumber.equal(await token.balanceOf(accounts[2]));

    let initialBalance = web3.toWei(1);
    await token.transfer(accounts[2], initialBalance, { from: accounts[0] });
    initialBalance.should.be.bignumber.equal(await token.balanceOf(accounts[2]));

    let burned = web3.toWei(0.3);

    assert.equal(accounts[0], await token.owner());

    // pause the token
    await token.pause({from: accounts[0]});

    try {
      await token.burn(burned, {from: accounts[2]});
      assert(false, 'burn should have thrown');
    } catch (error) {
      if (!help.isInvalidOpcodeEx(error)) throw error;
    }
    await token.unpause({from: accounts[0]});

    // now burn should work
    await token.burn(burned, {from: accounts[2]});

    new BigNumber(initialBalance).minus(burned).
      should.be.bignumber.equal(await token.balanceOf(accounts[2]));
    totalSupply.minus(burned).should.be.bignumber.equal(await token.totalSupply.call());
  });

  describe('vesting tokens', async () => {

    const tokenAmount = 50;
    const receiver = accounts[2];
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    const cliff = 100000;
    const vesting = 200000; // seconds

    it('can grant tokens if owner', async () => {
      await token.grantVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, true, { from: await token.owner() });
    });

    it('can NOT grant tokens if not owner', async () => {
      try {
        await token.grantVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, true, { from: accounts[1] });
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can mint vested tokens if owner', async () => {
      const supply = await token.balanceOf(receiver);
      await token.mintVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, true, { from: await token.owner() });
      supply.plus(tokenAmount).should.be.bignumber.equal(await token.balanceOf(accounts[2]));
      new BigNumber(0).should.be.bignumber.equal(await token.transferableTokens(receiver, now));
    });

    it('can NOT mint vested tokens if not owner', async () => {
      try {
        await token.mintVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, true, { from: accounts[1] });
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT mint vested tokens if cliff is bigger than startTime', async () => {
      try {
        await token.mintVestedTokens(receiver, tokenAmount, now + cliff, now, now + vesting, true, true, { from: await token.owner() });
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT mint vested tokens if vesting is bigger than cliff', async () => {
      try {
        await token.mintVestedTokens(receiver, tokenAmount, now, now + cliff, now, true, true, { from: await token.owner() });
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT have more than MAX_GRANTS_PER_ADDRESS grants per address', async () => {
      for (var i = 1; i <= 20; i++) {
        await token.mintVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, true, { from: await token.owner() });
      }
      try {
        await token.mintVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, true, { from: await token.owner() });
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

  });

});
