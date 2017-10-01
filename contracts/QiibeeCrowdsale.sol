pragma solidity ^0.4.11;

import "./RefundableOnTokenCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "./WhitelistedPreCrowdsale.sol";
import "./QiibeeToken.sol";

/**
   @title Crowdsale for the QBX Token Generation Event

   Implementation of the QBX Token Generation Event (TGE) Crowdsale: A 4-week, fixed token supply,
   dynamic token rate, capped on token, refundable crowdsale. Pre-ICO for whitelisted investors with
   a preferential rate.
   The crowdsale has a minimum cap (goal) of X tokens which in case of not being reached by
   purchases made during the 4-week period the token will not start operating and all funds sent
   during that period will be made available to be claimed by the originating addresses. Moreover,
   it will have a maximum cap of Y tokens.
 */

 //TODO: explain that goal is soft cap and cap is hard cap

//TODO: Check about multisig wallet
//TODO: Use uint64?
//TODO: Change start and end blocks to timestamps (https://github.com/OpenZeppelin/zeppelin-solidity/pull/353)

contract QiibeeCrowdsale is WhitelistedPreCrowdsale, RefundableOnTokenCrowdsale {
    using SafeMath for uint256;

    uint256 public constant TOTAL_SUPPLY = 10000000000000000000000000000; //in sqbx
    uint256 public constant FOUNDATION_SUPPLY = 7600000000000000000000000000; //in sqbx
    uint256 public constant CROWDSALE_SUPPLY = 2400000000000000000000000000; //in sqbx

    // initial rate of ether to QBX
    uint256 public initialRate;

    // maximum amount of qbx (in sqbx) that can be minted
    uint256 public cap;


    event WalletChange(address wallet);

    event InitialRateChange(uint256 rate);

    function QiibeeCrowdsale(
        uint256 _startPreTime,
        uint256 _endPreTime,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _initialRate,
        uint256 _preferentialRate,
        uint256 _goal,
        uint256 _cap,
        address _wallet
    )
        WhitelistedPreCrowdsale(_preferentialRate, _startPreTime, _endPreTime)
        RefundableOnTokenCrowdsale(_goal)
        Crowdsale(_startTime, _endTime, _initialRate, _wallet)
    {
        require(_initialRate > 0);
        require(_cap > 0);
        require(_goal <= _cap);
        require(_endPreTime < _startTime);

        initialRate = _initialRate;
        cap = _cap;

        QiibeeToken(token).pause();
    }

    function createTokenContract() internal returns(MintableToken) {
        return new QiibeeToken();
    }

    function getRate() public constant returns(uint256) {
        // preiod of the pre TGE
        bool withinPeriod = now >= startPreTime && now <= endPreTime;

        // some early buyers are offered a different rate rather than the preferential rate
        if (buyerRate[msg.sender] != 0 && withinPeriod) {
            return buyerRate[msg.sender];
        }

        // whitelisted buyers can purchase at preferential price during pre-ico event
        if (isWhitelisted(msg.sender) && withinPeriod) {
            return preferentialRate;
        }

        // what about rate < initialRate
        if (tokensSold >= goal) { //TODO: add this condition as well || (tokensSold + weiAmount.mul(initialRate)) > goal
            return initialRate.mul(1000).div(tokensSold.mul(1000).div(goal));
        }
        return initialRate;
    }

    function convertWeiToToken(uint256 weiAmount) internal returns(uint256) {
        uint256 rate = getRate();
        // calculate tokens amount
        return weiAmount.mul(rate);
    }

    // low level token purchase function
    function buyTokens(address beneficiary) payable {
        require(beneficiary != 0x0);
        require(validPurchase());

        uint256 rate = getRate();
        uint256 tokens = msg.value.mul(rate);
        uint256 newTokenAmount = tokensSold.add(tokens);
        assert(newTokenAmount <= cap);

        // update state
        weiRaised = weiRaised.add(msg.value);
        tokensSold = newTokenAmount;

        token.mint(beneficiary, tokens);

        TokenPurchase(msg.sender, beneficiary, msg.value, tokens);

        forwardFunds();
    }

    // directly mint tokens (used when people want to invest in a different currency than ETH)
    function mintTokens(address beneficiary) onlyOwner payable returns (bool) { //is it correct to add payable there?
        require(beneficiary != 0x0);
        require(validPurchase());

        uint256 rate = getRate();
        uint256 weiAmount = msg.value.mul(rate);
        uint256 newTokenAmount = tokensSold.add(msg.value);
        assert(newTokenAmount <= cap);

        //update state
        weiRaised = weiRaised.add(weiAmount);
        tokensSold = newTokenAmount;

        token.mint(beneficiary, msg.value);

        TokenPurchase(msg.sender, beneficiary, weiAmount, msg.value); //change event? or use this one?

        forwardFunds2(weiAmount, beneficiary); //check this call
    }

    /**
        @dev Allows to add the address and the amount of wei sent by a contributor
        in the private presale. Can only be called by the owner before the beginning
        of TGE

        @param beneficiary Address to which qbx will be sent
        @param rate Rate of the tokens sold
    */
    function addPrivatePresaleTokens(address beneficiary, uint256 rate) onlyOwner {
        require(now < startPreTime);
        require(beneficiary != address(0));

        uint256 tokens = msg.value ** 18; //convert qbx to sqbx
        uint256 weiAmount = msg.value.mul(rate);

        // totalPresaleWei.add(weiSent);
        //TODO: Do we need to totalise the 'wei' rased in the private sale even though we received fiat?
        //TODO: should we have a variable like totalPresaleWei so as someone can check that?
        //update state
        weiRaised = weiRaised.add(weiAmount);
        tokensSold = tokensSold.add(msg.value);

        token.mint(beneficiary, tokens);

        //TODO: forwardFunds?
    }

    function setWallet(address _wallet) onlyOwner public {
        require(_wallet != 0x0);
        wallet = _wallet;
        WalletChange(_wallet);
    }

    function unpauseToken() onlyOwner {
        require(isFinalized);
        QiibeeToken(token).unpause();
    }

    function pauseToken() onlyOwner {
        require(isFinalized);
        QiibeeToken(token).pause();
    }

    function finalization() internal {
        uint256 crowdsaleSupply = token.totalSupply();
        uint256 restSupply = CROWDSALE_SUPPLY.sub(crowdsaleSupply);
        //TODO: do the restSupply go to the foundation? If they go, just simplify the calculation with TOTAL_SUPPLY.sub(crowdsaleSupply).
        uint256 foundationSupply = FOUNDATION_SUPPLY.add(restSupply); //TODO: this is the 7.6bn PLUS
        token.mint(wallet, foundationSupply);
    }

    function finalize() onlyOwner { //make it public? redistribute tokens to other pools?
        require(!isFinalized);
        require(hasEnded());

        finalization();
        Finalized();

        isFinalized = true;

        unpauseToken();

        // transfer the ownership of the token to the foundation
        token.transferOwnership(owner);
    }

    // overriding Crowdsale#hasEnded to add cap logic
    function hasEnded() public constant returns (bool) {
        bool capReached = tokensSold >= cap;
        return super.hasEnded() || capReached;
    }

}
