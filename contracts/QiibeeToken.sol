pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/token/PausableToken.sol";
import "zeppelin-solidity/contracts/token/MintableToken.sol";
import "zeppelin-solidity/contracts/token/BurnableToken.sol";
import "zeppelin-solidity/contracts/token/VestedToken.sol";

/**
   @title QBX, the qiibee token

   Implementation of QBX, an ERC20 token for the qiibee ecosystem.
   It uses OpenZeppelin MintableToken and PausableToken. In addition,
   it has a BurnableToken responsible for burning tokens.

   The smallest unit of a qbx is the atto.
 */
contract QiibeeToken is BurnableToken, PausableToken, VestedToken, MintableToken {

    string public constant SYMBOL = "QBX";

    string public constant NAME = "qiibeeCoin";

    uint8 public constant DECIMALS = 18;

    /**
      @dev Burns a specific amount of tokens.
      @param _value The amount of tokens to be burnt.
    */
    function burn(uint256 _value) whenNotPaused public {
        super.burn(_value);
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
}
