pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/crowdsale/Crowdsale.sol";

/**
 * @title WhitelistedCrowdsale
 * @dev Extension of Crowsdale where an owner can whitelist addresses
 * which can invest in crowdsale before it opens to the public
 */
contract WhitelistedCrowdsale is Crowdsale, Ownable {
  using SafeMath for uint256;

  // list of addresses that can purchase before crowdsale opens
  mapping (address => bool) public whitelist;

  /*
   * @dev Constructor.
   * @param _startTime see `startTimestamp`
   * @param _endTime see `endTimestamp`
   * @param _rate see `rate` on Crowdsale.sol
   * @param _wallet see `wallet`
   */
  function WhitelistedCrowdsale (
      uint256 _startTime,
      uint256 _endTime,
      uint256 _rate,
      address _wallet
  )
    Crowdsale(_startTime, _endTime, _rate, _wallet)
  {
  }

  function addToWhitelist(address investor) public onlyOwner {
    require(investor != address(0));
    whitelist[investor] = true;
  }

  // @return true if investor is whitelisted
  function isWhitelisted(address investor) public constant returns (bool) {
    return whitelist[investor];
  }

  // @return true if buyer investor been removed
  function removeFromWhitelist(address investor) public onlyOwner {
      require(investor != address(0));
      whitelist[investor] = false;
  }

  // overriding Crowdsale#validPurchase to add whitelist logic
  // @return true if investors can buy at the moment
  function validPurchase() internal constant returns (bool) {
    // [TODO] issue with overriding and associativity of logical operators
    return super.validPurchase() || (!hasEnded() && isWhitelisted(msg.sender));
  }

}
