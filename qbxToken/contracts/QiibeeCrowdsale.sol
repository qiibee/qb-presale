pragma solidity ^0.4.11;

import "./CappedOnTokenCrowdsale.sol";
import "./RefundableOnTokenCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "./WhitelistedCrowdsale.sol";
import "./QiibeeToken.sol";

/**
   @title Crowdsale for the QBX Token Generation Event

   Implementation of the QBX Token Generation Event (TGE) Crowdsale: A 4-week
   fixed price (RE WRITE), capped token sale, with a discounted rate for contributions
   ìn the private presale and (THIS? a Market Validation Mechanism that will receive
   the funds over the USD 10M soft cap).
   The crowdsale has a minimum cap of USD XM which in case of not being reached
   by purchases made during the 4-week period the token will not start operating
   and all funds sent during that period will be made available to be claimed by
   the originating addresses.
 */

 /*
  * TODO: Whitelist guys
  *
  * We have to change MAYBE the validPurchase() so as the whitelisted guys can only buy before the ICO.
  * We also have to define a block (time period) when they can start buying in preferential rate and when it's over
  * Actually, it's over at the same time the ICO starts.
  *
  */

  //TODO: Check about multisig wallet

contract QiibeeCrowdsale is WhitelistedCrowdsale, CappedOnTokenCrowdsale, RefundableOnTokenCrowdsale {

    uint256 public constant TOTAL_SHARE = 100; //in %
    uint256 public constant CROWDSALE_SHARE = 24; //in %
    uint256 public constant FOUNDATION_SHARE = 76; //in % TODO: maybe create more wallets for diff pools

    // price at which whitelisted buyers will be able to buy tokens
    uint256 public preferentialRate;

    // customize the rate for each whitelisted buyer
    mapping (address => uint256) public buyerRate; //TOOD: do we need it?

    // initial rate at which tokens are offered
    uint256 public initialRate;

    // end rate at which tokens are offered
    uint256 public endRate;

    event WalletChange(address wallet);

    event PreferentialRateChange(address indexed buyer, uint256 rate);

    event InitialRateChange(uint256 rate);

    event EndRateChange(uint256 rate);

    function QiibeeCrowdsale(
        uint256 _startBlock,
        uint256 _endBlock,
        uint256 _initialRate,
        uint256 _endRate,
        uint256 _preferentialRate,
        uint256 _goal,
        uint256 _cap,
        address _wallet //TODO: multisig wallet? Escrow?? YES! Gnosis (from Consensys)
    )
        WhitelistedCrowdsale()
        CappedOnTokenCrowdsale(_cap)
        RefundableOnTokenCrowdsale(_goal)
        Crowdsale(_startBlock, _endBlock, _initialRate, _wallet)
    {
        require(_initialRate > 0);
        require(_endRate > 0);
        require(_preferentialRate > 0);
        require(_goal <= _cap);

        initialRate = _initialRate;
        endRate = _endRate;
        preferentialRate = _preferentialRate;

        QiibeeToken(token).pause();
    }

    function createTokenContract() internal returns(MintableToken) {
        return new QiibeeToken();
    }

    function setBuyerRate(address buyer, uint256 rate) onlyOwner public {
        require(rate != 0);
        require(isWhitelisted(buyer));
        require(block.number < startBlock);

        buyerRate[buyer] = rate;

        PreferentialRateChange(buyer, rate);
    }

    function setInitialRate(uint256 rate) onlyOwner public {
        require(rate != 0);
        require(block.number < startBlock);

        initialRate = rate;

        InitialRateChange(rate);
    }

    function setEndRate(uint256 rate) onlyOwner public {
        assert(rate != 0);
        require(block.number < startBlock);

        endRate = rate;

        EndRateChange(rate);
    }

    function getRate() internal returns(uint256) {
        // some early buyers are offered a discount on the crowdsale price
        if (buyerRate[msg.sender] != 0) {
            return buyerRate[msg.sender];
        }

        // whitelisted buyers can purchase at preferential price before crowdsale ends
        if (isWhitelisted(msg.sender)) {
            return preferentialRate;
        }

        //TODO: implement our strategy for making the rate dynamic

    }

    // low level token purchase function
    function buyTokens(address beneficiary) payable {
        require(beneficiary != 0x0);
        require(validPurchase());

        uint256 weiAmount = msg.value;
        uint256 updatedWeiRaised = weiRaised.add(weiAmount);

        uint256 rate = getRate();
        // calculate token amount to be created
        uint256 tokens = weiAmount.mul(rate);
        require(tokensSold.add(tokens) <= cap); //TODO: How to move it to validPurchase(). Or there is no need? OKAY

        // update state
        weiRaised = updatedWeiRaised;
        tokensSold = tokensSold.add(tokens);

        token.mint(beneficiary, tokens);

        TokenPurchase(msg.sender, beneficiary, weiAmount, tokens);

        forwardFunds();
    }

    //TODO: This function will be used in the case people send us other currency (FIAT, BTC, DASH, etc). So,
    // the idea is the directly mint the tokens without having to call the buyTokens() and send a wei amount.
    // function mint(address _to, uint256 _amount) onlyOwner canMint returns (bool) {
    //     require(validPurchase());

    //     uint256 weiAmount = msg.value;
    //     uint256 updatedWeiRaised = weiRaised.add(weiAmount);

    //     uint256 rate = getRate();
    //     // calculate token amount to be created
    //     uint256 weiAmount = _amount.div(rate);

    //     tokensSold = tokensSold.add(_amount);
    //     super.mint();

    //     forwardFunds(weiAmount)();
    // }

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

    function finalize() onlyOwner {
        require(!isFinalized);
        require(hasEnded());

        finalization();
        Finalized();

        isFinalized = true;

        unpauseToken();

        // transfer the ownership of the token to the foundation
        token.transferOwnership(owner);
    }

    //TODO: Do we need an emergency stop? Is it important?
    // function emergencyStopSale() onlyOwner {
    //     isFinalized = true;
    // }

    // function restartSale() onlyOwner {
    //     isFinalized = false;
    // }

}
