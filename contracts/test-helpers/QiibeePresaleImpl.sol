pragma solidity ^0.4.11;


import '../QiibeePresale.sol';


contract QiibeePresaleImpl is QiibeePresale {

  function QiibeePresaleImpl (
    uint256 _startTime,
    uint256 _endTime,
    uint256 _goal,
    uint256 _cap,
    uint256 _maxGasPrice,
    uint256 _minBuyingRequestInterval,
    address _wallet
  )
    QiibeePresale(_startTime, _endTime, _goal, _cap, _maxGasPrice, _minBuyingRequestInterval, _wallet)
  {
  }

}
