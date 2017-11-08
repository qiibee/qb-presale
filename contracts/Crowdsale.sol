pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "zeppelin-solidity/contracts/crowdsale/RefundVault.sol";
import "./QiibeeToken.sol";

/**
   @title Crowdsale for the QBX Token Generation Event

   Implementation of kind of an 'abstract' QBX Token Generation Event (TGE). This contract will be
   used by QiibeePresale.sol and QiibeeCrowdsale.

   This TGE includes is capped and has a spam prevention technique:
    * investors can make purchases with a frequency of X seconds given by maxCallFrequency.
    * investors are limited in the gas price

   In case of the goal not being reached by purchases made during the 4-week period the token will
   not start operating and all funds sent during that period will be made available to be claimed
   by the originating addresses.
 */

contract Crowdsale is Pausable {

    using SafeMath for uint256;

    uint256 public startTime;
    uint256 public endTime;

    uint256 public cap; // max amount of funds to be raised in weis
    uint256 public goal; // min amount of funds to be raised in weis
    RefundVault public vault; // refund vault used to hold funds while crowdsale is running

    QiibeeToken public token; // token being sold
    uint256 public tokensSold; // qbx minted (and sold)
    uint256 public weiRaised; // raised money in wei
    mapping (address => uint256) public balances; // balance of wei invested per investor

    // spam prevention
    mapping (address => uint256) public lastCallTime; // last call times by address
    uint256 public maxGasPrice; // max gas price per transaction
    uint256 public maxCallFrequency; // max frequency for purchases from a single source (in seconds)

    bool public isFinalized = false; // whether the crowdsale has finished or not

    address public wallet; // address where funds are collected

    /*
     * @dev event for change wallet logging
     * @param wallet new wallet address
     */
    event WalletChange(address wallet);

    /**
     * event for token purchase logging
     * @param purchaser who paid for the tokens
     * @param beneficiary who got the tokens
     * @param value weis paid for purchase
     * @param amount amount of tokens purchased
     */
    event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount);

    event Finalized();

    /*
     * @dev Constructor. Creates the token in a paused state
     * @param _startTime see `startTimestamp`
     * @param _endTime see `endTimestamp`
     * @param _goal see `see goal`
     * @param _cap see `see cap`
     * @param _maxGasPrice see `see maxGasPrice`
     * @param _maxCallFrequency see `see maxCallFrequency`
     * @param _wallet see `wallet`
     */
    function Crowdsale (
        uint256 _startTime,
        uint256 _endTime,
        uint256 _goal,
        uint256 _cap,
        uint256 _maxGasPrice,
        uint256 _maxCallFrequency,
        address _wallet
    )
    {
        require(_startTime >= now);
        require(_endTime >= _startTime);
        require(_cap > 0);
        require(_goal >= 0);
        require(_goal <= _cap);
        require(_maxGasPrice > 0);
        require(_maxCallFrequency >= 0);

        startTime = _startTime;
        endTime = _endTime;
        cap = _cap;
        goal = _goal;
        maxGasPrice = _maxGasPrice;
        maxCallFrequency = _maxCallFrequency;
        wallet = _wallet;

        token = new QiibeeToken();
        vault = new RefundVault(wallet);

        token.pause();

    }

    /*
     * @dev fallback function can be used to buy tokens
     */
    function () payable whenNotPaused {
      buyTokens(msg.sender);
    }

    /**
     * @dev Must be overridden to add buy token minting logic. The overriding function
     * should call super.finalization() to ensure the chain of buy tokens is
     * executed entirely.
     */
    function buyTokens(address beneficiary) public payable whenNotPaused {
      require(beneficiary != 0x0);
      require(validPurchase());

      uint256 weiAmount = msg.value;
      weiRaised = weiRaised.add(weiAmount);

      forwardFunds();
    }

    /*
     * @return true if investors can buy at the moment
     */
    function validPurchase() internal constant returns (bool) {
      bool withinFrequency = now.sub(lastCallTime[msg.sender]) >= maxCallFrequency;
      bool withinGasPrice = tx.gasprice <= maxGasPrice;
      bool withinPeriod = now >= startTime && now <= endTime;
      bool withinCap = weiRaised.add(msg.value) <= cap;
      bool nonZeroPurchase = msg.value != 0;
      return withinFrequency && withinGasPrice && withinPeriod && withinCap && nonZeroPurchase;
    }

    /*
     * @return true if crowdsale event has ended
     */
    function hasEnded() public constant returns (bool) {
      bool capReached = weiRaised >= cap;
      return now > endTime || capReached;
    }

    /*
     * @return true if crowdsale goal has reached
     */
    function goalReached() public constant returns (bool) {
      return weiRaised >= goal;
    }

    /*
     * In addition to sending the funds, we want to call the RefundVault deposit function
     */
    function forwardFunds() internal {
      vault.deposit.value(msg.value)(msg.sender);
    }

    /*
     * if crowdsale is unsuccessful, investors can claim refunds here
     */
    function claimRefund() public {
      require(isFinalized);
      require(!goalReached());

      vault.refund(msg.sender);
    }

    /**
     * @dev Must be called after crowdsale ends, to do some extra finalization
     * work. Calls the contract's finalization function.
     */
    function finalize() public {
      require(!isFinalized);
      require(hasEnded());

      finalization();
      Finalized();

      isFinalized = true;
    }

    /**
     * @dev Can be overridden to add finalization logic. The overriding function
     * should call super.finalization() to ensure the chain of finalization is
     * executed entirely.
     */
    function finalization() internal {
      if (goalReached()) {
        vault.close();
      } else {
        vault.enableRefunds();
      }
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

}
