var QiibeePresale = artifacts.require('./QiibeePresale.sol');

contract('create Presale', function(accounts) {

  it('can create a Presale', async function() {

    let presale = await QiibeePresale.new(
      1000, accounts[0]
    );

    assert.equal(1000, parseInt(await presale.cap()));
    assert.equal(accounts[0], parseInt(await presale.wallet()));
  });

});
