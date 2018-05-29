module.exports = {
  port: 8555,
  norpc: true,
  testCommand: 'truffle test --network coverage',
  copyNodeModules: true,
  skipFiles: [
    'test-helpers/Message.sol',
    'QiibeeMigrationToken.sol',
    'MultiSigWalletWithDailyLimit.sol',
  ]
}
