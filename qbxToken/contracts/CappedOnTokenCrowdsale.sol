pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/crowdsale/Crowdsale.sol";

/**
 * @title CappedOnTokenCrowdsale
 * @dev Extension of Crowsdale with a max amount of funds raised
 */
contract CappedOnTokenCrowdsale is Crowdsale {
  using SafeMath for uint256;

  // Amount of qbx minted and transferred during the TGE
  uint256 public tokensSold;

  uint256 public cap;

  function CappedOnTokenCrowdsale(uint256 _cap) {
    require(_cap > 0);
    cap = _cap;
  }

  // overriding Crowdsale#validPurchase to add extra cap logic
  // @return true if investors can buy at the moment
  // function validPurchase() internal constant returns (bool) {

  //   uint256 weiAmount = msg.value;
  //   uint256 rate = getRate();
  //   // calculate token amount to be created
  //   uint256 tokens = weiAmount.mul(rate);

  //   bool withinCap = tokensSold.add(tokens) <= cap;
  //   return super.validPurchase() && withinCap;
  // }

  // overriding Crowdsale#hasEnded to add cap logic
  // @return true if crowdsale event has ended
  function hasEnded() public constant returns (bool) {
    bool capReached = tokensSold >= cap;
    return super.hasEnded() || capReached;
  }

}
