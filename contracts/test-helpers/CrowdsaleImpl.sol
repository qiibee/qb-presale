pragma solidity ^0.4.11;


import '../Crowdsale.sol';


contract CrowdsaleImpl is Crowdsale {

  function CrowdsaleImpl (
    uint256 _startTime,
    uint256 _endTime,
    uint256 _goal,
    uint256 _cap,
    uint256 _maxGasPrice,
    uint256 _minBuyingRequestInterval,
    address _wallet
  )
    Crowdsale(_startTime, _endTime, _goal, _cap, _maxGasPrice, _minBuyingRequestInterval, _wallet)
  {
  }

}
