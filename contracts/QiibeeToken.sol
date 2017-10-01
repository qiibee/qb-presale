pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/token/PausableToken.sol";
import "zeppelin-solidity/contracts/token/MintableToken.sol";
import "zeppelin-solidity/contracts/token/VestedToken.sol";
import "./BurnableToken.sol";

/**
   @title QBX, the qiibee token

   Implementation of QBX, an ERC20 token for the qiibee ecosystem.
   It uses OpenZeppelin MintableToken and PausableToken. In addition,
   it has a BurnableToken responsible token burning.
 */
contract QiibeeToken is BurnableToken, PausableToken, MintableToken {

    string public constant symbol = "QBX";

    string public constant name = "QiibeeCoin";

    uint8 public constant decimals = 18;

    function burn(uint256 _value) whenNotPaused public {
        super.burn(_value);
    }
}
