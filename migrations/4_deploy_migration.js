
const MigrationAgent = artifacts.require("./MigrationAgent.sol");
const QiibeeToken = artifacts.require("./QiibeeToken.sol");

module.exports = function(deployer) {
  QiibeeToken.deployed().then(function(token){
    deployer.deploy(MigrationAgent, token.address);
  });
};
