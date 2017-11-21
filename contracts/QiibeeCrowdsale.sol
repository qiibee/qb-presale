pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/crowdsale/FinalizableCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/RefundableCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/CappedCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "zeppelin-solidity/contracts/lifecycle/Pausable.sol";

contract QiibeeToken {
  function mintVestedTokens(address _to,
    uint256 _value,
    uint64 _start,
    uint64 _cliff,
    uint64 _vesting,
    bool _revokable,
    bool _burnsOnRevoke,
    address _wallet
  ) returns (bool);
  function mint(address _to, uint256 _amount) returns (bool);
  function transferOwnership(address _wallet);
  function pause();
  function unpause();
  function finishMinting() returns (bool);
}

/**
   @title Crowdsale for the QBX Token Generation Event

   Implementation of the QBX Token Generation Event (TGE): A X-week capped presale with a soft cap
   and a hard cap, both of them expressed in wei. The crowdsale is NOT whitelisted.

   Tokens have a fixed rate until the goal (soft cap) is reached and then a dynamic rate linked to
   the amount of tokens sold is applied.

   In case of the goal not being reached by purchases made during the event the token will not start
   operating and all funds sent during this period will be made available to be claimed by the
   originating addresses.

   In the finalize() function, the FOUNDATION_SUPPLY tokens are minted and distributed to the
   foundation wallet. Token is unpaused and minting is disabled.
 */

contract QiibeeCrowdsale is CappedCrowdsale, FinalizableCrowdsale, RefundableCrowdsale, Pausable {

    using SafeMath for uint256;

    QiibeeToken public token; // token being sold

    uint256 public constant FOUNDATION_SUPPLY = 10e27; // total amount of tokens in atto for the pools

    uint256 public tokensSold; // qbx minted (and sold)

    mapping (address => uint256) public balances; // balance of wei invested per investor

    // spam prevention
    mapping (address => uint256) public lastCallTime; // last call times by address
    uint256 public maxGasPrice; // max gas price per transaction
    uint256 public minBuyingRequestInterval; // min request interval for purchases from a single source (in seconds)

    // limits
    uint256 public minInvest; // minimum invest in wei an address can do
    uint256 public maxCumulativeInvest; // maximum cumulative invest an address can do

    /*
     * @dev event for change wallet logging
     * @param wallet new wallet address
     */
    event WalletChange(address wallet);

    /*
     * @dev Constructor. Creates the token in a paused state
     * @param _startTime see `startTimestamp`
     * @param _endTime see `endTimestamp`
     * @param _rate see `rate` on Crowdsale.sol
     * @param _goal see `see goal`
     * @param _cap see `see cap`
     * @param _minInvest see `see minInvest`
     * @param _maxCumulativeInvest see `see maxCumulativeInvest`
     * @param _maxGasPrice see `see maxGasPrice`
     * @param _minBuyingRequestInterval see `see minBuyingRequestInterval`
     * @param _wallet see `wallet`
     */
    function QiibeeCrowdsale (
        uint256 _startTime,
        uint256 _endTime,
        uint256 _rate,
        uint256 _goal,
        uint256 _cap,
        uint256 _minInvest,
        uint256 _maxCumulativeInvest,
        uint256 _maxGasPrice,
        uint256 _minBuyingRequestInterval,
        address _wallet
    )
      Crowdsale(_startTime, _endTime, _rate, _wallet)
      CappedCrowdsale(_cap)
      RefundableCrowdsale(_goal)
    {
        require(_minInvest > 0);
        require(_maxCumulativeInvest > 0);
        require(_minInvest <= _maxCumulativeInvest);
        require(_maxGasPrice > 0);
        require(_minBuyingRequestInterval > 0);

        minInvest = _minInvest;
        maxCumulativeInvest = _maxCumulativeInvest;
        maxGasPrice = _maxGasPrice;
        minBuyingRequestInterval = _minBuyingRequestInterval;
    }

    /*
     * @dev Low level token purchase function.
     * @param beneficiary address where tokens are sent to
     */
    function buyTokens(address beneficiary) public payable whenNotPaused{
        require(beneficiary != address(0));
        require(validPurchase(beneficiary, msg.value));

        uint256 weiAmount = msg.value;

        uint256 tokens = weiAmount.mul(rate);

        // update state
        assert(QiibeeToken(token).mint(beneficiary, tokens));

        weiRaised = weiRaised.add(weiAmount);
        tokensSold = tokensSold.add(tokens);
        lastCallTime[msg.sender] = now;

        TokenPurchase(msg.sender, beneficiary, weiAmount, tokens);

        forwardFunds();
    }


    /*
     * Checks if the investment made is within the allowed limits
     */
    function validPurchase(address beneficiary, uint256 weiAmount) internal constant returns (bool) {
        uint256 newBalance = balances[beneficiary].add(weiAmount);
        bool withinLimits = newBalance <= maxCumulativeInvest && weiAmount >= minInvest;
        bool withinFrequency = now.sub(lastCallTime[msg.sender]) >= minBuyingRequestInterval;
        bool withinGasPrice = tx.gasprice <= maxGasPrice;
        return super.validPurchase() && withinLimits && withinFrequency && withinGasPrice;
    }

    /*
     * @dev Overrides Crowdsale#finalization() and is in charge of minting the tokens not sold
     * and send them to the foundation wallet.
     */
    function finalization() internal {
        QiibeeToken(token).mint(wallet, FOUNDATION_SUPPLY);
        super.finalization();
    }

    /**
      @dev Finalizes the crowdsale, calls finalization method (see `finalization()`),
      unpauses the token and transfers the token ownership to the foundation.
      This function can only be called when the crowdsale has ended.
    */
    function finalize() onlyOwner public {
        require(!isFinalized);
        require(hasEnded());

        finalization();
        Finalized();

        isFinalized = true;

        QiibeeToken(token).finishMinting();
        QiibeeToken(token).unpause();
        QiibeeToken(token).transferOwnership(wallet);
    }

    /**
      @dev changes the token owner
    */
    function setToken(address tokenAddress) onlyOwner {
      token = QiibeeToken(tokenAddress);
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

}
