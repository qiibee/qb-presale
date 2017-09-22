    var QiibeeCrowdsale = artifacts.require('./QiibeeCrowdsale.sol');
    var QiibeeToken = artifacts.require("./QiibeeToken");
    var Message = artifacts.require('./Message.sol');
    var help = require('./helpers');
    const timer = require('./helpers/timer');
    var latestTime = require('./helpers/latestTime');
    var {duration} = require('./helpers/increaseTime');
    var BigNumber = web3.BigNumber;

    require('chai')
      .use(require('chai-bignumber')(BigNumber))
      .should();

    const LOG_EVENTS = true;

    contract('QiibeeToken', function(accounts) {
        
    let token = null
    let now = 0

        var eventsWatcher;
    beforeEach(async function() {
        const rate = 100000000000;
      //   const crowdsale = await help.simulateCrowdsale(rate, [40,30,20,10,0], accounts, 1);
        token = await QiibeeToken.new();
        now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;

        eventsWatcher = token.allEvents();
        eventsWatcher.watch(function(error, log){
        //  if (LOG_EVENTS)
       //     console.log('Event:', log.event, ':',log.args);
        });
    });
  
   

    it('has name, symbol and decimals', async function() {
        assert.equal('QiibeeCoin', await token.name.call());
        assert.equal('QBX', await token.symbol.call());
        assert.equal(18, await token.decimals.call());
    });

    it('should mint 1000 qbx to account[1]', async function() {
      //  console.log(await token.mint(accounts[1], help.qbx2sqbx(1000)));
        await token.mint(accounts[0], 1000);
        assert.equal(1000, await token.balanceOf(accounts[0]));
    });
    
    it('should get the right totalSupply', async function() {
      //  console.log(await token.balanceOf(accounts[1]));
        assert.equal(0, await token.totalSupply.call());
        await token.mint(accounts[0], 1000);
        assert.equal(1000, await token.totalSupply.call());

    });
  
    it('should return correct balances after transfer', async function() {
      //  let token = await QiibeeToken.new();
        
       // await token.transfer(accounts[4], help.qbx2sqbx(3.55), { from: accounts[1] });
      //  await help.checkToken(token, accounts, 125, [36.45,30,20,13.55,0]);
    });
    
    
    
    
 
    it('should finish minting', async function() {
        // pause the token
         assert.equal(false, await token.mintingFinished.call());
         await token.finishMinting();
         assert.equal(true, await token.mintingFinished.call());
    });
    
    it('token is NOT paused', async function() {
        // pause the token
         assert.equal(false, await token.paused.call());
    });
    
    it('should pause the token', async function() {

    // pause the token
    await token.pause({from: accounts[0]});
    assert.equal(true, await token.paused.call());

   
    });
    
     it('should throw an error when trying to transfer more than balance', async function() {
        try {
          await token.transfer(accounts[2], 50);
          assert(false, 'transfer should have thrown');
        } catch (error) {
          if (!help.isInvalidOpcodeEx(error)) throw error;
        }
    });


    it('should transfer 1000 tokens to a account[2] leaving account[0] with 0 tokens', async function() {
        await token.mint(accounts[0], 1000);
        await token.transfer(accounts[2], 1000);
        assert.equal(0, await token.balanceOf(accounts[0]));
        assert.equal(1000, await token.balanceOf(accounts[2]));
    });
  
  
  
  
    it('should transfer 1000 tokens to a account[2] with 1 hour vesting and 30Min Cliff period', async function() {
        const cliff = 1800
        const vesting = 3600 // seconds
        /*
        grantVestedTokens(
            address _to,
            uint256 _value,
            uint64 _start,
            uint64 _cliff,
            uint64 _vesting,
            bool _revokable,
            bool _burnsOnRevoke
          )
          
          
           const cliff = 10000
    const vesting = 20000 // seconds

    beforeEach(async () => {
      await token.grantVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, false, { from: granter })
          
        */
        await token.mint(accounts[0], 1000);
        await token.grantVestedTokens(accounts[0], 500, now, now + cliff, now + vesting, true, false, { from: accounts[0]});
        assert.equal(1000, await token.balanceOf(accounts[0]));
        await token.transfer(accounts[2], 500);
        assert.equal(500, await token.balanceOf(accounts[0]));
        
       /* assert.equal(1000, await token.balanceOf(accounts[2]));
        await token.transfer(accounts[3], 1000, { from: accounts[2]});
        assert.equal(1000, await token.balanceOf(accounts[3]));*/
    });
  
  
   describe('getting a revokable/non-burnable token grant', async () => {
    const cliff = 10000
    const vesting = 20000 // seconds
    const granter = accounts[0]
    const receiver = accounts[1]
    const tokenAmount = 50


    beforeEach(async () => {
      await token.grantVestedTokens(receiver, tokenAmount, now, now + cliff, now + vesting, true, false, { from: granter })
    })

    it('tokens are received', async () => {
      assert.equal(await token.balanceOf(receiver), tokenAmount);
    })

    it('has 0 transferable tokens before cliff', async () => {
      assert.equal(await token.transferableTokens(receiver, now), 0);
    })

    it('all tokens are transferable after vesting', async () => {
      assert.equal(await token.transferableTokens(receiver, now + vesting), tokenAmount);
    })

    it('throws when trying to transfer non vested tokens', async () => {
      try {
        await token.transfer(accounts[7], 1, { from: receiver })
        assert.fail('should have thrown before');
      } catch(error) {
        assertJump(error);
      }
    })

    it('throws when trying to transfer from non vested tokens', async () => {
      try {
        await token.approve(accounts[7], 1, { from: receiver })
        await token.transferFrom(receiver, accounts[7], tokenAmount, { from: accounts[7] })
        assert.fail('should have thrown before');
      } catch(error) {
        assertJump(error);
      }
    })

    it('can be revoked by granter', async () => {
      await token.revokeTokenGrant(receiver, 0, { from: granter });
      assert.equal(await token.balanceOf(receiver), 0);
      assert.equal(await token.balanceOf(granter), 100);
    })

    it('cannot be revoked by non granter', async () => {
      try {
        await token.revokeTokenGrant(receiver, 0, { from: accounts[3] });
        assert.fail('should have thrown before');
      } catch(error) {
        assertJump(error);
      }
    })

    it('can be revoked by granter and non vested tokens are returned', async () => {
      await timer(cliff);
      await token.revokeTokenGrant(receiver, 0, { from: granter });
      assert.equal(await token.balanceOf(receiver), tokenAmount * cliff / vesting);
    })

    it('can transfer all tokens after vesting ends', async () => {
      await timer(vesting);
      await token.transfer(accounts[7], tokenAmount, { from: receiver })
      assert.equal(await token.balanceOf(accounts[7]), tokenAmount);
    })

    it('can approve and transferFrom all tokens after vesting ends', async () => {
      await timer(vesting);
      await token.approve(accounts[7], tokenAmount, { from: receiver })
      await token.transferFrom(receiver, accounts[7], tokenAmount, { from: accounts[7] })
      assert.equal(await token.balanceOf(accounts[7]), tokenAmount);
    })

    it('can handle composed vesting schedules', async () => {
      await timer(cliff);
      await token.transfer(accounts[7], 12, { from: receiver })
      assert.equal(await token.balanceOf(accounts[7]), 12);

      let newNow = web3.eth.getBlock(web3.eth.blockNumber).timestamp

      await token.grantVestedTokens(receiver, tokenAmount, newNow, newNow + cliff, newNow + vesting, false, false, { from: granter })

      await token.transfer(accounts[7], 13, { from: receiver })
      assert.equal(await token.balanceOf(accounts[7]), tokenAmount / 2);

      assert.equal(await token.balanceOf(receiver), 3 * tokenAmount / 2)
      assert.equal(await token.transferableTokens(receiver, newNow), 0)
      await timer(vesting);
      await token.transfer(accounts[7], 3 * tokenAmount / 2, { from: receiver })
      assert.equal(await token.balanceOf(accounts[7]), tokenAmount * 2)
    })
  })
  
 
 
});