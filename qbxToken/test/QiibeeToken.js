// @flow
'use strict'

const { EVMThrow } = require('./utils')
const QiibeeToken = artifacts.require('./QiibeeToken.sol')

const BigNumber = web3.BigNumber

contract('QiibeeCrowdsale', function ([owner, holder]) {

  let token

  beforeEach(async function () {
    token = await QiibeeToken.new()
  })

  it('cannot burn tokens while paused', async function () {
    await token.mint(holder, 1000)
    await token.pause()
    await token.burn(500, { from: holder }).should.be.rejectedWith(EVMThrow)

    await token.unpause()
    await token.burn(500, { from: holder }).should.be.fulfilled
  })
})
