pragma solidity ^0.4.11;

import "./RefundableOnTokenCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "./QiibeeToken.sol";
import "./TokenVesting.sol";

/**
   @title Crowdsale for the QBX Token Generation Event

   Implementation of the QBX Token Generation Event (TGE): A 4-week, fixed token supply with a
   fixed rate until the goal (soft cap) is reached and then a dynamic rate linked to the amount of
   tokens sold is applied. TGE has a cap on the amount of token (hard cap).

   Investments made during the presale (see QiibeePresale.sol) are added before the TGE starts
   through the addPresaleTokens() function.

   In case of the goal not being reached by purchases made during the 4-week period the token will
   not start operating and all funds sent during that period will be made available to be claimed
   by the originating addresses.
 */

contract QiibeeCrowdsale is RefundableOnTokenCrowdsale, Pausable {

    using SafeMath for uint256;

    // total amount of tokens in atto
    uint256 public constant TOTAL_SUPPLY = 10e27;

    // maximum amount of qbx (in atto) that can be minted
    uint256 public cap;

    // last call times by address
    mapping (address => uint256) public lastCallTime;

    // maximum gas price per transaction
    uint256 public maxGasPrice;

    // maximum frequency for purchases from a single source (in seconds)
    uint256 public maxCallFrequency;

    // minimum and maximum invest in atto per address
    uint256 public minInvest;
    uint256 public maxInvest;

    mapping (address => address) public vestings;

    /*
     * @dev event for change wallet logging
     * @param wallet new wallet address
     */
    event WalletChange(address wallet);

    /*
     * @dev event triggered every time a presale purchase is done
     * @param beneficiary address that received the tokens
     * @param weiAmount amount of ETH invested in wei
     * @param rate rate at which the investor bought the tokens
     */
    event TokenPresalePurchase(address indexed beneficiary, uint256 weiAmount, uint256 rate);

    /*
     * @dev Constructor. Creates the token in a paused state
     * @param _startTime see `startTimestamp`
     * @param _endTime see `endTimestamp`
     * @param _rate see `rate` on Crowdsale.sol
     * @param _goal see `see goal`
     * @param _cap see `see cap`
     * @param _minInvest see `see minInvest`
     * @param _maxInvest see `see maxInvest`
     * @param _maxGasPrice see `see maxGasPrice`
     * @param _maxCallFrequency see `see maxCallFrequency`
     * @param _wallet see `wallet`
     */
    function QiibeeCrowdsale(
        uint256 _startTime,
        uint256 _endTime,
        uint256 _rate,
        uint256 _goal,
        uint256 _cap,
        uint256 _minInvest,
        uint256 _maxInvest,
        uint256 _maxGasPrice,
        uint256 _maxCallFrequency,
        address _wallet
    )
        RefundableOnTokenCrowdsale(_goal)
        Crowdsale(_startTime, _endTime, _rate, _wallet)
    {
        require(_cap > 0);
        require(_goal <= _cap);
        require(_minInvest > 0);
        require(_maxInvest > 0);
        require(_minInvest <= _maxInvest);
        require(_maxGasPrice > 0);
        require(_maxCallFrequency > 0);

        cap = _cap;
        minInvest = _minInvest;
        maxInvest = _maxInvest;
        maxGasPrice = _maxGasPrice;
        maxCallFrequency = _maxCallFrequency;

        QiibeeToken(token).pause();
    }

    /*
     * @dev Creates the token to be sold. Override this method to have crowdsale of a specific mintable token.
     */
    function createTokenContract() internal returns(MintableToken) {
        return new QiibeeToken();
    }

    /*
     * @dev Returns the rate accordingly: before goal is reached, there is a fixed rate given by
     * `rate`. After that, the formula applies.
     * @return rate accordingly
     */
    function getRate() public constant returns(uint256) {
        if (tokensSold >= goal) {
            return rate.mul(1000).div(tokensSold.mul(1000).div(goal));
        }
        return rate;
    }

    /*
     * @dev Low level token purchase function.
     * @param beneficiary beneficiary address where tokens are sent to
     */
    function buyTokens(address beneficiary) public payable {
        require(beneficiary != address(0));
        // require(tx.origin != msg.sender); //TODO: do we want this?
        require(validPurchase());

        uint256 rate = getRate();
        uint256 tokens = msg.value.mul(rate);
        uint256 newBalance = token.balanceOf(beneficiary).add(tokens);

        require(newBalance <= maxInvest && tokens >= minInvest);
        require(now.sub(lastCallTime[msg.sender]) >= maxCallFrequency);
        require(tx.gasprice <= maxGasPrice);

        uint256 newTokenAmount = tokensSold.add(tokens);
        require(newTokenAmount <= cap);

        lastCallTime[msg.sender] = now;

        // update state
        weiRaised = weiRaised.add(msg.value);
        tokensSold = newTokenAmount;

        token.mint(beneficiary, tokens);

        TokenPurchase(msg.sender, beneficiary, msg.value, tokens);

        forwardFunds();
    }

    /**
     @dev adds the address and the amount of wei sent by an investor during presale.
     Can only be called by the owner before the beginning of TGE.

     @param beneficiary Address to which qbx will be sent
     @param weiSent Amount of wei contributed
     @param presaleRate qbx per ether rate at the moment of the contribution
   */
    function addPresaleTokens(address beneficiary, uint256 weiSent, uint256 presaleRate, uint64 cliffDate, uint64 vestingDate) public onlyOwner {
        require(now < startTime);
        require(beneficiary != address(0));
        require(weiSent > 0);
        require(presaleRate > 0);
        // validate that rate is higher than TGE rate
        require(presaleRate > rate);
        require(cliffDate > 0);
        require(vestingDate > 0);
        require(cliffDate <= vestingDate);

        //update state
        uint256 tokens = weiSent.mul(presaleRate);
        tokensSold = tokensSold.add(tokens);
        weiRaised = weiRaised.add(weiSent);

        TokenVesting vesting;
        if (vestings[beneficiary] == 0) {
          vesting = new TokenVesting(beneficiary, now, cliffDate, vestingDate, false);
          vestings[beneficiary] = vesting;
        } else {
          vesting = TokenVesting(vestings[beneficiary]);
        }
        token.mint(vesting, tokens);

        TokenPresalePurchase(beneficiary, weiSent, presaleRate);

        forwardFunds();
    }

    /*
     * @dev Changes the current wallet for a new one. Only the owner can call this function.
     * @param _wallet new wallet
     */
    function setWallet(address _wallet) onlyOwner public {
        require(_wallet != address(0));
        wallet = _wallet;
        WalletChange(_wallet);
    }

    /*
     * @dev Pauses the token. Only the owner can call this function.
     */
    function finalization() internal {
        uint256 crowdsaleSupply = token.totalSupply();
        uint256 foundationSupply = TOTAL_SUPPLY.sub(crowdsaleSupply);
        token.mint(wallet, foundationSupply);

        super.finalization();
    }

    /**
      @dev Finalizes the crowdsale, calls finalization method (see `finalization()`),
      unpauses the token and transfers the token ownership to the foundation.
      This function can only be called when the crowdsale has ended.
    */
    function finalize() public {
        require(!isFinalized);
        require(hasEnded());

        finalization();
        Finalized();

        isFinalized = true;

        // finish the minting of the token
        token.finishMinting();

        QiibeeToken(token).unpause();

        // transfer the ownership of the token to the foundation
        token.transferOwnership(wallet);
    }

    /*
     * @dev Checks if the crowdsale has ended. Overrides Crowdsale#hasEnded to add cap logic.
     * @return true if cap was reached or if TGE period is over.
     */
    function hasEnded() public constant returns (bool) {
        bool capReached = tokensSold >= cap;
        return super.hasEnded() || capReached;
    }

}
