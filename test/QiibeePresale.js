/*
 * This are tests taken from RefundableCrowdsale.sol, CappedCrowdsale.sol from Open Zeppelin
 * and adapted to the Crowdsale.
 */

const QiibeePresale = artifacts.require('QiibeePresale.sol');
const QiibeeToken = artifacts.require('QiibeeToken.sol');

const latestTime = require('./helpers/latestTime');
const { increaseTimeTestRPCTo, duration } = require('./helpers/increaseTime');
const help = require('./helpers.js');
const BigNumber = web3.BigNumber;

require('chai').
  use(require('chai-bignumber')(BigNumber)).
  should();

function assertExpectedException(e) {
  let isKnownException = help.isInvalidOpcodeEx(e);
  if (!isKnownException) {
    throw(e);
  }
}

contract('QiibeePresale', function ([owner, tokenOwner, wallet, migrationMaster]) {

  const defaultTimeDelta = duration.days(1); // time delta used in time calculations (for start, end1 & end2)
  const defaults = {
    rate: 6000,
    goal: new BigNumber(help.toWei(800)),
    cap: new BigNumber(help.toWei(1800)),
    distributionCap: new BigNumber(help.toAtto(100)),
    maxGasPrice: new BigNumber(5000000000000000000),
    minBuyingRequestInterval: 600,
    wallet: wallet
  };

  async function createPresale(params) {
    const startTime = params.start === undefined ? (latestTime() + defaultTimeDelta) : params.start,
      endTime = params.endTime === undefined ? (startTime + duration.weeks(1)) : params.endTime,
      rate = params.rate === undefined ? defaults.rate : params.rate,
      cap = params.cap === undefined ? defaults.cap : params.cap,
      distributionCap = params.distributionCap === undefined ? defaults.distributionCap : params.distributionCap,
      maxGasPrice = params.maxGasPrice === undefined ? defaults.maxGasPrice : params.maxGasPrice,
      minBuyingRequestInterval = params.minBuyingRequestInterval === undefined ? defaults.minBuyingRequestInterval : params.minBuyingRequestInterval,
      wallet = params.wallet === undefined ? defaults.wallet : params.foundationWallet;

    let token = await QiibeeToken.new(migrationMaster, {from: tokenOwner});
    return await QiibeePresale.new(startTime, endTime, token.address, rate, cap, distributionCap, maxGasPrice, minBuyingRequestInterval, wallet, {from: owner});
  }

  it('can create a qiibee presale', async function () {
    await createPresale({});
  });

  it('should fail creating qiibee presale with zero rate', async function () {
    try {
      await createPresale({rate: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee presale with zero distributionCap', async function () {
    try {
      await createPresale({distributionCap: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee presale with zero maxGasPrice', async function () {
    try {
      await createPresale({maxGasPrice: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail creating qiibee presale with zero minBuyingRequestInterval', async function () {
    try {
      await createPresale({minBuyingRequestInterval: 0});
    } catch (e) {
      assertExpectedException(e);
    }
  });

  it('should fail setting token after startTime', async function () {
    let presale = await createPresale({});
    let token = await QiibeeToken.new(migrationMaster);

    await increaseTimeTestRPCTo(await presale.startTime());
    try {
      await presale.setToken(token.address);
    } catch (e) {
      assertExpectedException(e);
    }
  });

});
