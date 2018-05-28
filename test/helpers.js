var _ = require('lodash');

var BigNumber = web3.BigNumber;

var QiibeeToken = artifacts.require('./QiibeeToken.sol');
var QiibeeCrowdsale = artifacts.require('./QiibeeCrowdsale.sol');
var abiDecoder = require('abi-decoder');
abiDecoder.addABI(QiibeeToken._json.abi);
abiDecoder.addABI(QiibeeCrowdsale._json.abi);

var latestTime = require('./helpers/latestTime');
var {increaseTimeTestRPC, increaseTimeTestRPCTo} = require('./helpers/increaseTime');

const DEBUG_MODE = (process.argv.indexOf('--verbose') > -1 ||
  process.argv.indexOf('--v') > -1 ||
  process.env.npm_config_qb_debug == 'true') ||
  process.env.QB_DEBUG == 'true';

let gasPriceFromEnv = parseInt(process.env.GAS_PRICE);
let gasPrice;
if (isNaN(gasPriceFromEnv))
  gasPrice = new BigNumber(21000000000);
else
  gasPrice = new BigNumber(gasPriceFromEnv);

module.exports = {

  zeroAddress: '0x0000000000000000000000000000000000000000',

  abiDecoder: abiDecoder,

  inCoverage: () => process.env.SOLIDITY_COVERAGE == 'true',

  gasPrice: gasPrice,

  txGasCost: (tx) => gasPrice.mul(new BigNumber(tx.receipt.gasUsed)),

  getAccountsBalances: (accounts) => {
    return _.reduce(accounts, (balances, account) => {
      balances[accounts.indexOf(account)] = web3.eth.getBalance(account);
      return balances;
    }, {});
  },

  hexEncode: function(str){
    var hex, i;
    var result = '';
    for (i=0; i < str.length; i++) {
      hex = str.charCodeAt(i).toString(16);
      result += ('000'+hex).slice(-4);
    }
    return result;
  },

  hexDecode: function(str){
    var j;
    var hexes = str.match(/.{1,4}/g) || [];
    var back = '';
    for(j = 0; j<hexes.length; j++) {
      back += String.fromCharCode(parseInt(hexes[j], 16));
    }
    return back;
  },

  fromAtto: function(value){
    return web3.fromWei(value, 'ether');
  },

  toAtto: function(value){
    return web3.toWei(value, 'ether');
  },

  toWei: function(value){
    return web3.toWei(value, 'ether');
  },

  fromWei: function(value){
    return web3.toWei(value, 'ether');
  },

  isInvalidOpcodeEx: function(e) {
    return e.message.search('invalid opcode') >= 0;
  },

  hasWrongArguments: function(e) {
    return e.message.search('contract constructor expected') >= 0;
  },

  waitBlocks: function(toWait, accounts){
    return this.waitToBlock(parseInt(web3.eth.blockNumber) + toWait, accounts);
  },

  simulateCrowdsale: async function(rate, goal, cap, minInvest, maxCumulativeInvest, maxGasPrice, minBuyingRequestInterval, accounts, balances, finish) {
    await increaseTimeTestRPC(1);
    var startTime = latestTime() + 5;
    var endTime = startTime + 10;
    var crowdsale = await QiibeeCrowdsale.new(
      startTime, endTime,
      rate,
      goal, cap,
      minInvest, maxCumulativeInvest,
      maxGasPrice, minBuyingRequestInterval,
      accounts[0]
    );

    await increaseTimeTestRPCTo(latestTime() + 1);
    await increaseTimeTestRPCTo(startTime + 3);

    for(let i = 0; i < 5; i++) {
      if (balances[i] > 0) {
        await crowdsale.sendTransaction({ value: web3.toWei(balances[i], 'ether'), from: accounts[i + 1]});
      }
    }
    if (finish) {
      await increaseTimeTestRPCTo(endTime+1);
      await crowdsale.finalize();
    }
    return crowdsale;
  },

  debug: DEBUG_MODE ? console.log : function() {},

  checkToken: async function(token, accounts, totalSupply, balances) {
    let debug = this.debug;
    let [
      tokenTotalSupply,
      tokenAccountBalances,
    ] = await Promise.all([
      token.totalSupply(),
      Promise.all([
        token.balanceOf(accounts[1]),
        token.balanceOf(accounts[2]),
        token.balanceOf(accounts[3]),
        token.balanceOf(accounts[4]),
        token.balanceOf(accounts[5])
      ])
    ]);

    debug('Total Supply:', this.fromAtto(parseFloat(tokenTotalSupply)));
    for(let i = 0; i < 5; i++) {
      debug(
        'Account[' + (i + 1) + ']',
        accounts[i + 1],
        ', Balance:', this.fromAtto(tokenAccountBalances[i])
      );
    }

    if (totalSupply)
      assert.equal(this.fromAtto(parseFloat(tokenTotalSupply)), totalSupply);
    if (balances){
      assert.equal(this.fromAtto(tokenAccountBalances[0]), balances[0]);
      assert.equal(this.fromAtto(tokenAccountBalances[1]), balances[1]);
      assert.equal(this.fromAtto(tokenAccountBalances[2]), balances[2]);
      assert.equal(this.fromAtto(tokenAccountBalances[3]), balances[3]);
      assert.equal(this.fromAtto(tokenAccountBalances[4]), balances[4]);
    }
  },

  getCrowdsaleExpectedRate: function(state) {
    let { rate, goal } = state.crowdsaleData,
      { tokensSold } = state;

    if (state.weiRaised.gte(goal)) {
      return parseInt(rate * 1000 / parseInt((tokensSold * 1000) / goal));
    }
    return rate;
  },

};
