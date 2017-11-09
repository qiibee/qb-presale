pragma solidity ^0.4.11;

import "./Crowdsale.sol";

/**
   @title Crowdsale for the QBX Token Generation Event

   Implementation of the QBX Token Generation Event (TGE): A 4-week, fixed token supply with a
   fixed rate until the goal (soft cap) is reached and then a dynamic rate linked to the amount of
   tokens sold is applied.



   In case of the goal not being reached by purchases made during the 4-week period the token will
   not start operating and all funds sent during that period will be made available to be claimed
   by the originating addresses.
 */

contract QiibeeCrowdsale is Crowdsale {

    using SafeMath for uint256;

    uint256 public constant TOTAL_SUPPLY = 10e27; // total amount of tokens in atto

    uint256 public rate; // how many token units a buyer gets per wei

    // minimum and maximum invest in wei per address
    uint256 public minInvest;
    uint256 public maxInvest;

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
    function QiibeeCrowdsale (
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
      Crowdsale(_startTime, _endTime, _goal, _cap, _maxGasPrice, _maxCallFrequency, _wallet)
    {
        require(_rate > 0);
        require(_minInvest >= 0);
        require(_maxInvest > 0);
        require(_minInvest <= _maxInvest);

        rate = _rate;
        minInvest = _minInvest;
        maxInvest = _maxInvest;
    }

    /*
     * @dev Returns the rate accordingly: before goal is reached, there is a fixed rate given by
     * `rate`. After that, the formula applies.
     * @return rate accordingly
     */
    function getRate() public constant returns(uint256) {
        if (goalReached()) {
            return rate.mul(1000).div(tokensSold.mul(1000).div(goal));
        }
        return rate;
    }

    /*
     * @dev Low level token purchase function.
     * @param beneficiary address where tokens are sent to
     */
    function buyTokens(address beneficiary) public payable whenNotPaused{
        require(beneficiary != address(0));
        require(validPurchase(beneficiary));

        uint256 rate = getRate();
        uint256 tokens = msg.value.mul(rate);

        // update state
        weiRaised = weiRaised.add(msg.value);
        tokensSold = tokensSold.add(tokens);
        lastCallTime[msg.sender] = now;

        //TODO: vest tokens?

        token.mint(beneficiary, tokens);

        TokenPurchase(msg.sender, beneficiary, msg.value, tokens);

        forwardFunds();
    }

    /*
     * Checks if the investment made is within the allowed limits
     */
    function validPurchase(address beneficiary) internal constant returns (bool) {
        // check limits
        uint256 newBalance = balances[beneficiary].add(msg.value);
        bool withinLimits = newBalance <= maxInvest && msg.value >= minInvest;
        return withinLimits && super.validPurchase();
    }

    /*
     * @dev Overrides Crowdsale#finalization() and is in charge of minting the tokens not sold
     * and send them to the foundation wallet.
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

        token.finishMinting();
        token.unpause();
        token.transferOwnership(wallet);
    }

}
