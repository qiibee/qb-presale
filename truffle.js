var HDWalletProvider = require("truffle-hdwallet-provider");
var mnemonic = "exhibit salmon capital index grunt debris lunar burst initial broccoli salute involve";

module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*',
      gas: 0x5B8D80, // 6000000 gas
      gasPrice: 21000000000 // 21 Gwei
    },
    ropsten: {
      network_id: 3,    // Use the ID provided at craddeation time
      provider: new HDWalletProvider(mnemonic, "https://ropsten.infura.io/leXGApLcGixJvwRW3gCI"), // The actual api key infura gave you
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
