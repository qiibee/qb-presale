pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/token/PausableToken.sol";
import "zeppelin-solidity/contracts/token/MintableToken.sol";
import "zeppelin-solidity/contracts/token/BurnableToken.sol";
import "zeppelin-solidity/contracts/token/VestedToken.sol";

// @dev Migration Agent interface
contract MigrationAgentInterface {
  function migrateFrom(address _from, uint256 _value);
  function setSourceToken(address _qbxSourceToken);
}

/**
   @title QBX, the qiibee token

   Implementation of QBX, an ERC20 token for the qiibee ecosystem. The smallest unit of a qbx is
   the atto. The token call be migrated to a new token by calling the `migrate()` function.
 */
contract QiibeeToken is BurnableToken, PausableToken, VestedToken, MintableToken {

    string public constant SYMBOL = "QBX";

    string public constant NAME = "qiibeeCoin";

    uint8 public constant DECIMALS = 18;

    // migration vars
    uint256 public totalMigrated;
    address public migrationAgent;
    address public migrationMaster;

    event Migrate(address indexed _from, address indexed _to, uint256 _value);

    modifier onlyMigrationMaster {
        require(msg.sender == migrationMaster);
        _;
    }

    /*
     * Constructor.
     */
    function QiibeeToken(address _migrationMaster) {
      require(_migrationMaster != address(0));
      migrationMaster = _migrationMaster;
    }

    /**
      @dev Similar to grantVestedTokens but minting tokens instead of transferring.
    */
    function mintVestedTokens (
      address _to,
      uint256 _value,
      uint64 _start,
      uint64 _cliff,
      uint64 _vesting,
      bool _revokable,
      bool _burnsOnRevoke,
      address _wallet
    ) onlyOwner public returns (bool) {
      // Check for date inconsistencies that may cause unexpected behavior
      require(_cliff >= _start && _vesting >= _cliff);

      require(tokenGrantsCount(_to) < MAX_GRANTS_PER_ADDRESS);   // To prevent a user being spammed and have his balance locked (out of gas attack when calculating vesting).

      uint256 count = grants[_to].push(
                  TokenGrant(
                    _revokable ? _wallet : 0, // avoid storing an extra 20 bytes when it is non-revokable
                    _value,
                    _cliff,
                    _vesting,
                    _start,
                    _revokable,
                    _burnsOnRevoke
                  )
                );

      return mint(_to, _value); //mint tokens
    }

    /**
      @dev Overrides VestedToken#grantVestedTokens(). Only owner can call it.
    */
    function grantVestedTokens (
      address _to,
      uint256 _value,
      uint64 _start,
      uint64 _cliff,
      uint64 _vesting,
      bool _revokable,
      bool _burnsOnRevoke
    ) onlyOwner public {
      super.grantVestedTokens(_to, _value, _start, _cliff, _vesting, _revokable, _burnsOnRevoke);
    }

    /**
      @dev Set address of migration agent contract and enable migration process.
      @param _agent The address of the MigrationAgent contract
     */
    function setMigrationAgent(address _agent) public onlyMigrationMaster {
      require(migrationAgent == address(0));
      migrationAgent = _agent;
    }

    /**
      @dev Migrates the tokens to the target token through the MigrationAgent.
      @param _value The amount of tokens (in atto) to be migrated.
     */
    function migrate(uint256 _value) public whenNotPaused {
      require(migrationAgent != address(0));
      require(_value != 0);
      require(_value <= balances[msg.sender]);

      balances[msg.sender] -= _value;
      totalSupply -= _value;
      totalMigrated += _value;
      MigrationAgentInterface(migrationAgent).migrateFrom(msg.sender, _value);
      Migrate(msg.sender, migrationAgent, _value);
    }

    /*
     * @dev Changes the migration master.
     * @param _master The address of the migration master.
     */
    function setMigrationMaster(address _master) public onlyMigrationMaster {
      require(_master != address(0));
      migrationMaster = _master;
    }

    /*
     * @dev Burns a specific amount of tokens.
     * @param _value The amount of tokens to be burnt.
     */
    function burn(uint256 _value) whenNotPaused public {
        super.burn(_value);
    }
}
