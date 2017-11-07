// /*
//  * This are tests taken from RefundableCrowdsale.sol, CappedCrowdsale.sol from Open Zeppelin
//  * and adapted to the Crowdsale.
//  */

// const QiibeePresale = artifacts.require('QiibeePresaleImpl.sol');

// const latestTime = require('./helpers/latestTime');
// const { duration } = require('./helpers/increaseTime');
// const help = require('./helpers.js');
// const BigNumber = web3.BigNumber;

// require('chai').
//   use(require('chai-bignumber')(BigNumber)).
//   should();

// contract('QiibeePresale', function ([owner, wallet]) {

//   const defaultTimeDelta = duration.days(1); // time delta used in time calculations
//   const defaults = {
//     goal: new BigNumber(help.toWei(800)),
//     cap: new BigNumber(help.toWei(1800)),
//     maxGasPrice: new BigNumber(5000000000000000000),
//     maxCallFrequency: 600,
//     wallet: wallet
//   };

//   async function createCrowdsale(params) {
//     const startTime = params.start === undefined ? (latestTime() + defaultTimeDelta) : params.start,
//       endTime = params.endTime === undefined ? (startTime + duration.weeks(1)) : params.endTime,
//       goal = params.goal === undefined ? defaults.goal : params.goal,
//       cap = params.cap === undefined ? defaults.cap : params.cap,
//       maxGasPrice = params.maxGasPrice === undefined ? defaults.maxGasPrice : params.maxGasPrice,
//       maxCallFrequency = params.maxCallFrequency === undefined ? defaults.maxCallFrequency : params.maxCallFrequency,
//       wallet = params.wallet === undefined ? defaults.wallet : params.foundationWallet;

//     return await QiibeePresale.new(startTime, endTime, goal, cap, maxGasPrice, maxCallFrequency, wallet, {from: owner});
//   }

//   it('can create a qiibee presale', async function() {
//     await createCrowdsale({});
//   });

// });
