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
    uint256 public startPreTimestamp;
    uint256 public endPreTimestamp;
    uint256 public tokensSold;

    // price at which whitelisted buyers will be able to buy tokens
    uint256 public preferentialRate;

    // customize the rate for each whitelisted buyer
    mapping (address => uint256) public buyerRate;

    // list of addresses that can purchase during pre-ico event (a.k.a before crowdsale opens)
    mapping (address => bool) public whitelist;

    event PreferentialRateChange(address indexed buyer, uint256 rate);

    function WhitelistedPreCrowdsale(uint256 _preferentialRate) {
        require(_preferentialRate > 0);
        preferentialRate = _preferentialRate;
    }

    function addToWhitelist(address buyer) public onlyOwner {
        require(buyer != 0x0);
        whitelist[buyer] = true;
    }

    function removeFromWhitelist(address buyer) public onlyOwner {
        require(buyer != 0x0);
        whitelist[buyer] = false;
    }

    function isWhitelisted(address buyer) public constant returns (bool) {
        return whitelist[buyer];
    }

    // @return true if whitelisted buyers can buy at the moment
    function validPrePurchase() internal constant returns (bool) {
        require(isWhitelisted(msg.sender));
        bool withinPeriod = now >= startPreTimestamp && now <= endPreTimestamp;
        bool nonZeroPurchase = msg.value != 0;
        return withinPeriod && nonZeroPurchase;
    }

    // low level token purchase function
    function buyPreferentialTokens(address beneficiary) payable {
        require(beneficiary != 0x0);
        require(validPrePurchase());

        uint256 weiAmount = msg.value;
        uint256 updatedWeiRaised = weiRaised.add(weiAmount);

        uint256 rate = getRate();
        // calculate token amount to be created
        uint256 tokens = weiAmount.mul(rate);
        // require(tokensSold.add(tokens) <= cap); //if use this approach, maybe we save gas cause there's a function that is being called twice that would be called just once.

        // update state
        weiRaised = updatedWeiRaised;
        tokensSold = tokensSold.add(tokens);

        token.mint(beneficiary, tokens);

        TokenPurchase(msg.sender, beneficiary, weiAmount, tokens);

        forwardFunds();
    }

    function getRate() internal returns(uint256) {
        // some early buyers are offered a different rate rather than the preferential rate
        if (buyerRate[msg.sender] != 0) {
            return buyerRate[msg.sender];
        }

        // whitelisted buyers can purchase at preferential price during pre-ico event
        if (isWhitelisted(msg.sender)) {
            return preferentialRate;
        }
    }

    function setBuyerRate(address buyer, uint256 rate) onlyOwner public {
        require(rate != 0);
        require(isWhitelisted(buyer));
        require(now < startPreTimestamp);

        buyerRate[buyer] = rate;

        PreferentialRateChange(buyer, rate);
    }
}
