require('babel-register');
require('babel-polyfill');

module.exports = {
  networks: {
    livenet: {
      host: "10.8.0.6",
      port: 8545,
      network_id: "1" // Match any network id
    }
  }
};
