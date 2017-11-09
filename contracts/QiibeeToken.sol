pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/token/PausableToken.sol";
import "zeppelin-solidity/contracts/token/MintableToken.sol";
import "zeppelin-solidity/contracts/token/BurnableToken.sol";
import "./VestedToken.sol";

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
    function burn(uint256 _value) whenNotPaused onlyOwner public {
        super.burn(_value);
    }
}
