pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "./QiibeeToken.sol";

// interface
contract QiibeeMigrationTokenInterface {
  function createToken(address _target, uint256 _amount);
  function finalizeMigration();
  function totalSupply() returns (uint256);
}

contract MigrationAgent is Ownable {

  address public qbxSourceToken;
  address public qbxTargetToken;
  uint256 public tokenSupply;

  function MigrationAgent(address _qbxSourceToken) {
    require(QiibeeToken(_qbxSourceToken).migrationAgent() ==  address(0));
    tokenSupply = QiibeeToken(_qbxSourceToken).totalSupply();
    qbxSourceToken = _qbxSourceToken;
  }

  function safetyInvariantCheck(uint256 _value) internal {
    require(QiibeeToken(qbxSourceToken).totalSupply() + QiibeeMigrationTokenInterface(qbxTargetToken).totalSupply() == tokenSupply - _value);
  }

  function setTargetToken(address _qbxTargetToken) public onlyOwner {
    require(qbxTargetToken == address(0)); //Allow this change once only
    qbxTargetToken = _qbxTargetToken;
  }

  function migrateFrom(address _from, uint256 _value) public {
    require(msg.sender == qbxSourceToken);
    require(qbxTargetToken != address(0));

    safetyInvariantCheck(_value); // qbxSourceToken has already been updated, but corresponding QBX have not been created in the qbxTargetToken contract yet
    QiibeeMigrationTokenInterface(qbxTargetToken).createToken(_from, _value);
    safetyInvariantCheck(0); // totalSupply invariant must hold
  }

  function finalizeMigration() public onlyOwner {
    require(qbxTargetToken != address(0));
    require(QiibeeToken(qbxSourceToken).totalSupply() == 0); //only finlize if all tokens have been migrated
    safetyInvariantCheck(0);
    QiibeeMigrationTokenInterface(qbxTargetToken).finalizeMigration();

    qbxSourceToken = address(0);
    qbxTargetToken = address(0);
    tokenSupply = 0;
  }
}
