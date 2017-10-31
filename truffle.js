var bip39 = require("bip39");
var ethwallet = require('ethereumjs-wallet');
var ProviderEngine = require("web3-provider-engine");
var WalletSubprovider = require('web3-provider-engine/subproviders/wallet.js');
var Web3Subprovider = require("web3-provider-engine/subproviders/web3.js");
var Web3 = require("web3");

// Insert raw hex private key here, e.g. using MyEtherWallet
var wallet = ethwallet.fromPrivateKey(Buffer.from('565ab4d82b78522f88a185c4d533845d66a7eb3bbf1dd7436a4c110527749a72', 'hex'));
var address = "0x" + wallet.getAddress().toString("hex");
console.log(address);
var providerUrl = "https://ropsten.infura.io/leXGApLcGixJvwRW3gCI";
var engine = new ProviderEngine();
engine.addProvider(new WalletSubprovider(wallet, {}));
engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(providerUrl)));
// network connectivity error
engine.on('error', function(err) {
    // report connectivity errors
    console.error(err.stack)
})

engine.start(); // Required by the provider engine.

module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*',
      gas: 0x5B8D80, // 6000000 gas
      gasPrice: 21000000000 // 21 Gwei
    },
    "ropsten": {
      network_id: 4,    // Use the ID provided at creation time
      provider: engine, // Use our custom provider
      from: address,     // Use the address we derived
      gas: 4700000, // crowdsale uses 4454368 gas
      gasPrice: 22000000000 // in wei = 22 gwei
    },
    coverage: {
      host: "localhost",
      port: 8555,
      network_id: "*",
      gas: 0xfffffffffff,
      gasPrice: 0x01
    }
  },
  rpc: {
    host: "localhost",
    port: 8545
  }
};
