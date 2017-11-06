pragma solidity ^0.4.11;


import '../WhitelistedCrowdsale.sol';


contract WhitelistedCrowdsaleImpl is WhitelistedCrowdsale {

  function WhitelistedCrowdsaleImpl (
    uint256 _startTime,
    uint256 _endTime,
    uint256 _rate,
    address _wallet
  )
    Crowdsale(_startTime, _endTime, _rate, _wallet)
    WhitelistedCrowdsale()
  {
  }

}
