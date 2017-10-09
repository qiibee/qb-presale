pragma solidity ^0.4.11;

import "./RefundableOnTokenCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "./WhitelistedPresale.sol";
import "./QiibeeToken.sol";

/**
   @title Crowdsale for the QBX Token Generation Event

   Implementation of the QBX Token Generation Event (TGE): A 4-week, fixed token supply with a
   fixed rate until the goal (soft cap) is reached and then a dynamic rate linked to the amount of
   tokens sold is applied. TGE has a cap on the amount of token (hard cap).

   There is pre-TGE for whitelisted investors with global a preferential rate. They can also
   have a special rate (different for each whiteslisted investor) that will apply only if they buy
   a determined amount of ETH (if not, they just get the global preferential rate).

   In case of the goal not being reached by purchases made during the 4-week period the token will
   not start operating and all funds sent during that period will be made available to be claimed
   by the originating addresses.
 */

contract QiibeeCrowdsale is WhitelistedPresale, RefundableOnTokenCrowdsale, Pausable {

    using SafeMath for uint256;

    // total amount of tokens in atto
    uint256 public constant TOTAL_SUPPLY = 10e27;

    // initial rate of ether to qbx
    uint256 public initialRate;

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

    /*
     * event for change wallet logging
     * @param wallet new wallet address
     */
    event WalletChange(address wallet);

    /**
       @dev Constructor. Creates the token in a paused state
       @param _startPreTime see `startPreTime`
       @param _endPreTime see `endPreTime`
       @param _startTime see `startTimestamp`
       @param _endTime see `endTimestamp`
       @param _initialRate see `initialRate`
       @param _preferentialRate see `preferentialRate`
       @param _goal see `see goal`
       @param _cap see `see cap`
       @param _minInvest see `see minInvest`
       @param _maxInvest see `see maxInvest`
       @param _wallet see `wallet`
     */
    function QiibeeCrowdsale(
        uint256 _startPreTime,
        uint256 _endPreTime,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _initialRate,
        uint256 _preferentialRate,
        uint256 _goal,
        uint256 _cap,
        uint256 _minInvest,
        uint256 _maxInvest,
        uint256 _maxGasPrice,
        uint256 _maxCallFrequency,
        address _wallet
    )
        WhitelistedPresale(_preferentialRate, _startPreTime, _endPreTime)
        RefundableOnTokenCrowdsale(_goal)
        Crowdsale(_startTime, _endTime, _initialRate, _wallet)
    {
        require(_initialRate > 0);
        require(_cap > 0);
        require(_goal <= _cap);
        require(_minInvest > 0);
        require(_maxInvest > 0);
        require(_minInvest <= _maxInvest);
        require(_maxGasPrice > 0);
        require(_maxCallFrequency > 0);
        require(_endPreTime < _startTime);

        initialRate = _initialRate;
        startTime = _startTime;
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
     * @dev Returns the rate according different scenarios:
     * 1. If current period is presale and the address trying to buy is whitelisted, the
     * preferential rate is applied (unless there is a special rate assigned to it).
     * 2. If current period is crowdsale, the `initalRate` is applied until the goal is reached.
     * Afterwards, a dynamic rate is applied according to the total amount of tokens sold so far
     * (see formula in code).
     * NOTE: if current period is the crowdsale, no preferential rate nor spcial rate is applied
     * no matter if the user is whitelisted or not.
     * @return rate accordingly
     */
    function getRate() public constant returns(uint256) {
        // preiod of the pre TGE
        bool withinPeriod = now >= startPreTime && now <= endPreTime;

        // whitelisted buyers can purchase at preferential price during pre-ico event
        if (withinPeriod && isWhitelisted(msg.sender)) {
            // some early buyers are offered a different rate rather than the preferential rate
            if (buyerRate[msg.sender] != 0) {
                return buyerRate[msg.sender];
            }
            return preferentialRate;
        }

        if (tokensSold >= goal) {
            return initialRate.mul(1000).div(tokensSold.mul(1000).div(goal));
        }

        return initialRate;
    }

    /*
     * @dev Low level token purchase function.
     * @param beneficiary benficiary address where tokens are sent to
     */
    function buyTokens(address beneficiary) public payable {
        require(beneficiary != address(0));
        // require(tx.origin != msg.sender); //TODO: do we want this?
        require(validPurchase());

        uint256 rate = getRate();
        uint256 tokens = msg.value.mul(rate);

        if (now >= startTime) {
            uint256 newBalance = token.balanceOf(beneficiary).add(tokens);
            require(newBalance <= maxInvest && tokens >= minInvest);
            require(now.sub(lastCallTime[msg.sender]) >= maxCallFrequency);
            require(tx.gasprice <= maxGasPrice);
        }

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

    /*
     * @dev Changes the current wallet for a new one. Only the owner can call this function.
     * @param _wallet new wallet
     */
    function setWallet(address _wallet) onlyOwner public {
        require(_wallet != 0x0);
        wallet = _wallet;
        WalletChange(_wallet);
    }

    /*
     * @dev Unpauses the token. Only the owner can call this function.
     */
    function unpauseToken() onlyOwner {
        require(isFinalized);
        QiibeeToken(token).unpause();
    }

    /*
     * @dev Pauses the token. Only the owner can call this function.
     */
    function pauseToken() onlyOwner {
        require(isFinalized);
        QiibeeToken(token).pause();
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
      This function can be called only by the owner and when the crowdsale has ended.
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
