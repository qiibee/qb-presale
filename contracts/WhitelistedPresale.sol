pragma solidity ^0.4.11;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/crowdsale/Crowdsale.sol';

/**
 * @title WhitelistedPresale
 * @dev Extension of Crowsdale where an owner can whitelist addresses
 * which can buy in presale before it opens to the public crowdsale
 */
contract WhitelistedPresale is Crowdsale, Ownable {
    using SafeMath for uint256;

    // start and end block for the presale event where whitelisted buyers are allowed
    uint256 public startPreTime;
    uint256 public endPreTime;

    // global rate at which whitelisted buyers will be able to buy tokens
    uint256 public preferentialRate;

    // whitelisted buyers can have a special rate (that overrides the preferential one)
    mapping (address => uint256) public buyerRate;

    // list of addresses that can purchase during presale event
    mapping (address => bool) public whitelist;

    event PreferentialRateChange(address indexed buyer, uint256 rate);

    /*
     * @dev Constructor. Sets the timestamps for the presale and the preferentialRate.
     * @param beneficiary benficiary address where tokens are sent to
     */
    function WhitelistedPresale(uint256 _preferentialRate, uint256 _startPreTime, uint256 _endPreTime) {
        require(_startPreTime >= now);
        require(_preferentialRate > 0);

        preferentialRate = _preferentialRate;
        startPreTime = _startPreTime;
        endPreTime = _endPreTime;
    }

    /*
     * @dev Add buyer to the whitelist. Only the owner can call this function and must do it before
     * presale has started.
     * @param buyer address that will be added to the whitelist
     */
    function addToWhitelist(address buyer) public onlyOwner {
        require(buyer != address(0));
        require(now < startPreTime);

        whitelist[buyer] = true;
    }

    /*
     * @dev Check if address is whitelisted.
     * @param buyer address where check is made from
     * @return true if address is whitelisted
     */
    function isWhitelisted(address buyer) public constant returns (bool) {
        return whitelist[buyer];
    }

    /*
     * @dev Validates the purchase is withing the corresponding sale period (pre or normal). If it's
     * presale period it checks that the sender is whitelisted and the amount is more than 0. It
     * overrides Crowdsale#validPurchase().
     * @return true if buyer can buy at the moment
     */
    function validPurchase() internal constant returns (bool) {
        bool withinPeriod = now >= startPreTime && now <= endPreTime;
        bool nonZeroPurchase = msg.value != 0;
        return super.validPurchase() || (withinPeriod && isWhitelisted(msg.sender) && nonZeroPurchase);
    }

    /*
     * @dev Set buyer an special rate. Only the owner can call this function and must do it before
     * presale has started.
     * @param buyer address where the special rate will be assigned to
     * @param rate special rate for the given address
     */
    function setBuyerRate(address buyer, uint256 rate) onlyOwner public {
        require(rate != 0);
        require(isWhitelisted(buyer));
        require(now < startPreTime);

        buyerRate[buyer] = rate;

        PreferentialRateChange(buyer, rate);
    }
}
