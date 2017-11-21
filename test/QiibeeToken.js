var help = require('./helpers');

var BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

var QiibeeToken = artifacts.require('QiibeeToken.sol');
var QiibeeMigrationToken = artifacts.require('QiibeeMigrationToken.sol');
var MigrationAgent = artifacts.require('MigrationAgent.sol');

contract('qiibeeToken', function(accounts) {

  let token, targetToken, migrationAgent,
    migrationMaster = accounts[5];

  beforeEach(async function() {
    token = await QiibeeToken.new(migrationMaster);
    await token.mint(accounts[0], web3.toWei(1), {from: await token.owner()});
    await token.mint(accounts[1], web3.toWei(1), {from: await token.owner()});
  });

  it('has name, symbol and decimals', async function() {
    assert.equal('QBX', await token.SYMBOL());
    assert.equal('qiibeeCoin', await token.NAME());
    assert.equal(18, await token.DECIMALS());
  });

  it('can NOT create a qiibee token with no migration master', async function() {
    try {
      await QiibeeToken.new(migrationMaster);
    } catch (error) {
      if (!help.isInvalidOpcodeEx(error)) throw error;
    }
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
      await token.mintVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, true, accounts[0], { from: await token.owner() });
      supply.plus(tokenAmount).should.be.bignumber.equal(await token.balanceOf(accounts[2]));
      new BigNumber(0).should.be.bignumber.equal(await token.transferableTokens(receiver, now));
    });

    it('can NOT mint vested tokens if not owner', async () => {
      try {
        await token.mintVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, true, accounts[0], { from: accounts[1] });
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT mint vested tokens if cliff is bigger than startTime', async () => {
      try {
        await token.mintVestedTokens(receiver, tokenAmount, now + cliff, now, now + vesting, true, true, accounts[0], { from: await token.owner() });
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT mint vested tokens if vesting is bigger than cliff', async () => {
      try {
        await token.mintVestedTokens(receiver, tokenAmount, now, now + cliff, now, true, true, accounts[0], { from: await token.owner() });
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT have more than MAX_GRANTS_PER_ADDRESS grants per address', async () => {
      for (var i = 1; i <= 20; i++) {
        await token.mintVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, true, accounts[0], { from: await token.owner() });
      }
      try {
        await token.mintVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, true, accounts[0], { from: await token.owner() });
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

  });

  describe('creating migration agent', async () => {

    beforeEach(async function() {
      migrationAgent = await MigrationAgent.new(token.address);
      targetToken = await QiibeeMigrationToken.new(migrationAgent.address);
      assert.equal(help.zeroAddress, await token.migrationAgent());
    });

    it('can NOT create migration agent if it has already been created', async () => {
      await token.setMigrationAgent(migrationAgent.address, {from: migrationMaster});
      try {
        migrationAgent = await MigrationAgent.new(token.address);
      } catch(error) {
        assert.notEqual(help.zeroAddress, await token.migrationAgent());
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can set a MigrationAgent', async () => {
      await token.setMigrationAgent(migrationAgent.address, {from: migrationMaster});
      assert.notEqual(help.zeroAddress, await token.migrationAgent());
    });

    it('can NOT set a MigrationAgent if not master', async () => {
      try {
        await token.setMigrationAgent(migrationAgent.address, {from: accounts[1]});
      } catch(error) {
        assert.equal(help.zeroAddress, await token.migrationAgent());
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT set a MigrationAgent if already set', async () => {
      await token.setMigrationAgent(migrationAgent.address, {from: migrationMaster});
      try {
        await token.setMigrationAgent(migrationAgent.address, {from: migrationMaster});
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT set a MigrationAgent if address is zero', async () => {
      try {
        await token.setMigrationAgent(help.zeroAddress, {from: migrationMaster});
      } catch(error) {
        assert.notEqual(help.zeroAddress, await token.migrationAgent());
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

  });

  describe('other migrating tests', async () => {

    it('can NOT migrate tokens if migration has not been set', async () => {
      try {
        await token.migrate(web3.toWei(1), {from: accounts[1]});
      } catch(error) {
        assert.equal(help.zeroAddress, await token.migrationAgent());
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT migrate tokens if target token has not been set to migration agent', async () => {
      migrationAgent = await MigrationAgent.new(token.address);
      await token.setMigrationAgent(migrationAgent.address, {from: migrationMaster});

      try {
        await token.migrate(web3.toWei(1), {from: accounts[1]});
      } catch(error) {
        assert.notEqual(help.zeroAddress, await token.migrationAgent());
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT finalize migration if target token has not been set', async () => {
      migrationAgent = await MigrationAgent.new(token.address);
      try {
        await migrationAgent.finalizeMigration();
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can change migration master', async () => {
      await token.setMigrationMaster(accounts[2], {from: migrationMaster});
      assert.equal(accounts[2], await token.migrationMaster());
    });

    it('can NOT change migration master if not migration master', async () => {
      try {
        await token.setMigrationMaster(accounts[2], {from: accounts[2]});
      } catch(error) {
        assert.equal(migrationMaster, await token.migrationMaster());
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

  });

  describe('migrating tokens', async () => {

    beforeEach(async function() {
      migrationAgent = await MigrationAgent.new(token.address);
      targetToken = await QiibeeMigrationToken.new(migrationAgent.address);
      await migrationAgent.setTargetToken(targetToken.address);
      await token.setMigrationAgent(migrationAgent.address, {from: migrationMaster});
      assert.notEqual(help.zeroAddress, await token.migrationAgent());
    });

    it('can migrate tokens', async () => {
      await token.migrate(web3.toWei(1), {from: accounts[1]});
      assert.notEqual(help.zeroAddress, await token.migrationAgent());
      (await token.balanceOf(accounts[1])).should.be.bignumber.equal(new BigNumber(0));
      (await token.totalMigrated()).should.be.bignumber.equal(web3.toWei(1));
    });

    it('can NOT migrate 0 tokens', async () => {
      try {
        await token.migrate(web3.toWei(0), {from: accounts[1]});
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT migrate more tokens than my balance', async () => {
      try {
        await token.migrate(web3.toWei(2), {from: accounts[1]});
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can NOT migrate from another source', async () => {
      try {
        await migrationAgent.migrateFrom(accounts[0], web3.toWei(1), {from: accounts[0]});
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('can finalize migration', async () => {
      await token.migrate(web3.toWei(1), {from: accounts[0]});
      await token.migrate(web3.toWei(1), {from: accounts[1]});
      await migrationAgent.finalizeMigration();
    });

    it('can NOT finalize migration until all tokens have been migrated', async () => {
      await token.migrate(web3.toWei(1), {from: accounts[0]});
      try {
        await migrationAgent.finalizeMigration({from: accounts[0]});
      } catch(error) {
        assert.notEqual(help.zeroAddress, await migrationAgent.qbxSourceToken());
        assert.notEqual(help.zeroAddress, await migrationAgent.qbxTargetToken());
        assert.notEqual(help.zeroAddress, await migrationAgent.tokenSupply());
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
      await token.migrate(web3.toWei(1), {from: accounts[1]});
      await migrationAgent.finalizeMigration({from: accounts[0]});
      assert.equal(help.zeroAddress, await migrationAgent.qbxSourceToken());
      assert.equal(help.zeroAddress, await migrationAgent.qbxTargetToken());
      new BigNumber(0).should.be.bignumber.equal(await migrationAgent.tokenSupply());
    });

    it('can NOT finalize migration if non-owner', async () => {
      await token.migrate(web3.toWei(1), {from: accounts[0]});
      await token.migrate(web3.toWei(1), {from: accounts[1]});
      try {
        await migrationAgent.finalizeMigration({from: accounts[1]});
      } catch(error) {
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

    it('force safetyInvariantCheck to fail', async () => {
      await token.mint(accounts[0], web3.toWei(1), {from: await token.owner()});
      try {
        await token.migrate(web3.toWei(1), {from: accounts[1]});
      } catch(error) {
        (await token.totalMigrated()).should.be.bignumber.equal(0);
        if (!help.isInvalidOpcodeEx(error)) throw error;
      }
    });

  });

});
