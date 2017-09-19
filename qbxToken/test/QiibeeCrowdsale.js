// @flow
'use strict'

const expect = require('chai').expect

const { advanceToBlock, ether, should, EVMThrow } = require('./utils')
const QiibeeCrowdsale = artifacts.require('./QiibeeCrowdsale.sol')
// const QiibeeContinuousSale = artifacts.require('./QiibeeContinuousSale.sol')
const QiibeeToken = artifacts.require('./QiibeeToken.sol')

const BigNumber = web3.BigNumber


// TEST THAT WHITELISTED BUYERS IN THE NORMAL CROWDSALE GET THE NORMAL RATE AND NOT THE PREFERENTIAL ONE

contract('QiibeeCrowdsale', function ([_, wallet, wallet2, buyer, purchaser, buyer2, purchaser2]) {

  const initialRate = new BigNumber(1000)
  const endRate = new BigNumber(900)

  const newRate = new BigNumber(500)
  const preferentialRate = new BigNumber(2000)
  const value = ether(1)

  const goal = new BigNumber(2000)
  const cap = new BigNumber(10000000000000000000000000000000) //has to be number of tokens

  const expectedFoundationTokens = new BigNumber(6000)
  const expectedTokenSupply = new BigNumber(10000)

  let startBlock, endBlock
  let crowdsale, token

  beforeEach(async function () {
    startBlock = web3.eth.blockNumber + 10
    endBlock = web3.eth.blockNumber + 20

    crowdsale = await QiibeeCrowdsale.new(
      startBlock,
      endBlock,
      initialRate,
      endRate,
      preferentialRate,
      goal,
      cap,
      wallet
    )
    token = QiibeeToken.at(await crowdsale.token())
  })

  it('starts with token paused', async function () {
    const paused = await token.paused()
    paused.should.equal(true)
  })

  it('owner should be able to change wallet', async function () {
    await crowdsale.setWallet(wallet2)
    let wallet = await crowdsale.wallet()
    wallet.should.equal(wallet2)
  })

  it('non-owner should not be able to change wallet', async function () {
    await crowdsale.setWallet(wallet2, {from: purchaser}).should.be.rejectedWith(EVMThrow)
  })

  it('owner should be able to unpause token after crowdsale ends', async function () {
    await advanceToBlock(endBlock)

    await crowdsale.unpauseToken().should.be.rejectedWith(EVMThrow)

    await crowdsale.finalize()

    let paused = await token.paused()
    paused.should.equal(true)

    await crowdsale.unpauseToken()

    paused = await token.paused()
    paused.should.equal(false)
  })

  describe('WRITE TEST FOR RATES!', async function () {

  })

  it('whitelisted buyers should access tokens at reduced price until end of auction', async function () {
    await crowdsale.addToWhitelist(buyer)

    await crowdsale.buyTokens(buyer, {value, from: buyer})
    const balance = await token.balanceOf(buyer)
    balance.should.be.bignumber.equal(value.mul(preferentialRate))
  })

  // it('whitelisted big whale investor should not exceed the cap', async function () {
  //   const cap = (await crowdsale.cap());
  //   const overCap = cap.mul(2);
  //   await crowdsale.addToWhitelist(buyer);
  //   await crowdsale.buyTokens(buyer, {value: overCap, from: buyer}).should.be.rejectedWith(EVMThrow);
  //   const balance = await token.balanceOf(buyer);
  //   const raised = await crowdsale.weiRaised();
  //   balance.should.be.bignumber.equal(0);
  //   raised.should.be.bignumber.most(cap);
  // })

  it('whitelisted big whale investor should not exceed the cap', async function () {
    const cap = (await crowdsale.cap());
    const overCap = cap.mul(2);
    await crowdsale.addToWhitelist(buyer);
    await crowdsale.buyTokens(buyer, {value: overCap, from: buyer}).should.be.rejectedWith(EVMThrow);
    const tokens = await crowdsale.tokensSold();
    tokens.should.be.bignumber.most(cap);
  })

  it('owner can set the price for a particular buyer', async function() {
    await crowdsale.addToWhitelist(buyer)

    const preferentialRateForBuyer = new BigNumber(200)
    const { logs } = await crowdsale.setBuyerRate(buyer, preferentialRateForBuyer)

    const event = logs.find(e => e.event === 'PreferentialRateChange')
    expect(event).to.exist

    await crowdsale.buyTokens(buyer, {value, from: buyer})
    const balance = await token.balanceOf(buyer)
    balance.should.be.bignumber.equal(value.mul(preferentialRateForBuyer))
    balance.should.not.be.bignumber.equal(value.mul(preferentialRate))

    // cannot change rate after crowdsale starts
    await advanceToBlock(startBlock - 1)
    await crowdsale.setBuyerRate(buyer, preferentialRateForBuyer).should.be.rejectedWith(EVMThrow)
  })

  it('owner cannot set a custom rate before whitelisting a buyer', async function() {
    await crowdsale.setBuyerRate(buyer, new BigNumber(200)).should.be.rejectedWith(EVMThrow)
  })

  it('beneficiary is not the same as buyer', async function() {
    const beneficiary = buyer2

    await crowdsale.addToWhitelist(buyer)
    await crowdsale.addToWhitelist(beneficiary)

    const preferentialRateForBuyer = new BigNumber(200)
    const invalidRate = new BigNumber(100)
    await crowdsale.setBuyerRate(buyer, preferentialRateForBuyer)
    await crowdsale.setBuyerRate(beneficiary, invalidRate)

    await crowdsale.buyTokens(beneficiary, {value, from: buyer})
    const balance = await token.balanceOf(beneficiary)
    balance.should.be.bignumber.equal(value.mul(preferentialRateForBuyer))
  })

  it('tokens should be assigned correctly to foundation when finalized', async function () {
    await advanceToBlock(startBlock - 1)

    // since price at first block is 1000, total tokens emitted will be 4000
    await crowdsale.buyTokens(buyer, {value: 4, from: purchaser})

    await advanceToBlock(endBlock)
    await crowdsale.finalize()

    const balance = await token.balanceOf(wallet)
    balance.should.be.bignumber.equal(expectedFoundationTokens)

    const totalSupply = await token.totalSupply()
    totalSupply.should.be.bignumber.equal(expectedTokenSupply)
  })
})
