pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/token/PausableToken.sol";

/**
   @title Example of a new token
 */
contract QiibeeMigrationToken is PausableToken {

    string public constant SYMBOL = "QBX";

    string public constant NAME = "qiibeeCoin";

    uint8 public constant DECIMALS = 18;

    // migration vars
    address public migrationAgent;

    function QiibeeMigrationToken(address _migrationAgent) {
        require(_migrationAgent != address(0));
        migrationAgent = _migrationAgent;
    }

    // Migration related methods
    function createToken(address _target, uint256 _amount) {
        require(msg.sender == migrationAgent);

        balances[_target] += _amount;
        totalSupply += _amount;

        Transfer(migrationAgent, _target, _amount);
    }

    function finalizeMigration() {
        require(msg.sender == migrationAgent);
        migrationAgent = 0;
    }
}
