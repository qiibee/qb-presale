module.exports = {
  port: 8555,
  norpc: true,
  // testCommand: 'node ../node_modules/.bin/truffle test --network coverage',
  copyNodeModules: true,
  skipFiles: [
    'test-helpers/Message.sol',
    'VestedToken.sol',
    'CrowdsaleImpl.sol',
    'QiibeePresaleImpl.sol',
    'WhitelistedCrowdsaleImpl.sol'
  ]
}
