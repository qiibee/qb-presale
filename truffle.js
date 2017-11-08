var HDWalletProvider = require("truffle-hdwallet-provider");
var mnemonic = "[ SEED PHRASE ]";

if (!process.env.SOLIDITY_COVERAGE){
  // This is a stub to use in case you begin validating on a testnet using HDWallet.
  // HDWallet interferes with the coverage runner so it needs to be instantiated conditionally.
  // For more info see the solidity-coverage FAQ.
  //
  // provider = new HDWalletProvider(mnemonic, 'https://ropsten.infura.io/')
}

module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*',
      gasPrice: 22000000000
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
