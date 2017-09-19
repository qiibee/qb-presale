pragma solidity ^0.4.11;

import "./RefundableOnTokenCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "./WhitelistedCrowdsale.sol";
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

//TODO: Check about multisig wallet
//TODO: Use uint64?
//TODO: Change start and end blocks to timestamps (https://github.com/OpenZeppelin/zeppelin-solidity/pull/353)

contract QiibeeCrowdsale is WhitelistedCrowdsale, RefundableOnTokenCrowdsale {

    uint256 public constant TOTAL_SHARE = 100; //in %
    uint256 public constant CROWDSALE_SHARE = 24; //in %
    uint256 public constant FOUNDATION_SHARE = 76; //in % TODO: maybe create more wallets for diff pools

    // price at which whitelisted buyers will be able to buy tokens
    uint256 public preferentialRate;

    // initial rate at which tokens are offered
    uint256 public initialRate;

    // amount of qbx minted and transferred during the TGE
    uint256 public tokensSold;

    // maximum amount of tokens that can be minted
    uint256 public cap;


    event WalletChange(address wallet);

    event PreferentialRateChange(address indexed buyer, uint256 rate);

    event InitialRateChange(uint256 rate);

    function QiibeeCrowdsale(
        uint256 _startBlock,
        uint256 _endBlock,
        uint256 _initialRate,
        uint256 _preferentialRate,
        uint256 _goal,
        uint256 _cap,
        address _wallet
    )
        WhitelistedCrowdsale()
        RefundableOnTokenCrowdsale(_goal)
        Crowdsale(_startBlock, _endBlock, _initialRate, _wallet)
    {
        require(_initialRate > 0);
        require(_preferentialRate > 0);
        require(_cap > 0);
        require(_goal <= _cap);

        initialRate = _initialRate;
        preferentialRate = _preferentialRate;
        cap = _preferentialRate;

        QiibeeToken(token).pause();
    }

    function createTokenContract() internal returns(MintableToken) {
        return new QiibeeToken();
    }

    function getRate() internal returns(uint256) {
        // what about rate < initialRate
        if (tokensSold > goal) {
            return initialRate / (tokensSold / goal);
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
        uint256 tokens = convertWeiToToken(msg.value);
        require(tokensSold.add(tokens) <= cap);

        // update state
        weiRaised = weiRaised.add(msg.value);
        tokensSold = tokensSold.add(tokens);

        token.mint(beneficiary, tokens);

        TokenPurchase(msg.sender, beneficiary, msg.value, tokens);

        forwardFunds();
    }

    // directly mint tokens (used when people want to invest in a different currency than ETH)
    function mintTokens(address beneficiary) onlyOwner payable returns (bool) { //is it correct to add payable there?
        require(validPurchase());
        require(tokensSold.add(msg.value) <= cap);

        uint256 rate = getRate();
        // calculate wei price for the amount of tokens
        uint256 weiAmount = msg.value.mul(rate);

        //update state
        weiRaised = weiRaised.add(weiAmount);
        tokensSold = tokensSold.add(msg.value);

        token.mint(beneficiary, msg.value);

        TokenPurchase(msg.sender, beneficiary, weiAmount, msg.value); //change event? or use this one?

        forwardFunds2(weiAmount, beneficiary); //check this call
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
        uint256 totalSupply = token.totalSupply(); //2bn
        uint256 finalSupply = TOTAL_SHARE.mul(totalSupply).div(CROWDSALE_SHARE); //10bn

        // emit tokens for the foundation
        token.mint(wallet, FOUNDATION_SHARE.mul(finalSupply).div(TOTAL_SHARE)); //6.3bn
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
