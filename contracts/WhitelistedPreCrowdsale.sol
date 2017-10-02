pragma solidity ^0.4.11;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/crowdsale/Crowdsale.sol';

/**
 * @title WhitelistedCrowdsale
 * @dev Extension of Crowsdale where an owner can whitelist addresses
 * which can buy in crowdsale before it opens to the public
 */
contract WhitelistedPreCrowdsale is Crowdsale, Ownable {
    using SafeMath for uint256;

    // start and end block for the pre-ico event where whitelisted investments are allowed
    uint256 public startPreTime;
    uint256 public endPreTime;

    // price at which whitelisted buyers will be able to buy tokens
    uint256 public preferentialRate;

    // customize the rate for each whitelisted buyer
    mapping (address => uint256) public buyerRate;

    // minimum investment that each whiteslited buyer has to do
    mapping (address => uint256) public buyerMinimum;

    // list of addresses that can purchase during pre-ico event (a.k.a before crowdsale opens)
    mapping (address => bool) public whitelist;

    event PreferentialRateChange(address indexed buyer, uint256 rate);

    function WhitelistedPreCrowdsale(uint256 _preferentialRate, uint256 _startPreTime, uint256 _endPreTime) {
        require(_startPreTime >= now);
        require(_preferentialRate > 0);

        preferentialRate = _preferentialRate;
        startPreTime = _startPreTime;
        endPreTime = _endPreTime;
    }

    function addToWhitelist(address buyer) public onlyOwner {
        require(buyer != address(0));
        require(now <= startPreTime);

        whitelist[buyer] = true;
    }

    function removeFromWhitelist(address buyer) public onlyOwner {
        require(buyer != address(0));
        whitelist[buyer] = false;
    }

    function isWhitelisted(address buyer) public constant returns (bool) {
        return whitelist[buyer];
    }

    // @return true if whitelisted buyers can buy at the moment
    function validPurchase() internal constant returns (bool) {
        bool withinPeriod = now >= startPreTime && now <= endPreTime;
        bool nonZeroPurchase = msg.value != 0;
        return super.validPurchase() || (withinPeriod && isWhitelisted(msg.sender) && nonZeroPurchase);
    }

    function setBuyerRate(address buyer, uint256 rate, uint256 minimum) onlyOwner public {
        require(rate != 0);
        require(isWhitelisted(buyer));
        require(now < startPreTime);

        buyerRate[buyer] = rate;
        buyerMinimum[buyer] = minimum;

        PreferentialRateChange(buyer, rate);
    }
}
