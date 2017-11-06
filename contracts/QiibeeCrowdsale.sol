pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "zeppelin-solidity/contracts/crowdsale/RefundVault.sol";
import "./QiibeeToken.sol";

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

contract QiibeeCrowdsale is Pausable {

    using SafeMath for uint256;

    uint256 public constant TOTAL_SUPPLY = 10e27; // total amount of tokens in atto

    uint256 public startTime;
    uint256 public endTime;

    uint256 public rate; // how many token units a buyer gets per wei

    uint256 public cap;
    uint256 public goal; // minimum amount of funds to be raised in weis
    RefundVault public vault; // refund vault used to hold funds while crowdsale is running

    QiibeeToken public token; // token being sold
    uint256 public tokensSold; // qbx minted (and sold)
    uint256 public weiRaised; // raised money in wei
    mapping (address => uint256) public balances; // balance of wei invested per investor

    // minimum and maximum invest in wei per address
    uint256 public minInvest;
    uint256 public maxInvest;

    // spam prevention
    mapping (address => uint256) public lastCallTime; // last call times by address
    uint256 public maxGasPrice; // max gas price per transaction
    uint256 public maxCallFrequency; // max frequency for purchases from a single source (in seconds)

    bool public isFinalized = false;

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
    event NewAccreditedInvestor(address indexed from, address indexed buyer);

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
    {
        require(_startTime >= now);
        require(_endTime >= _startTime);
        require(_rate > 0);
        require(_cap > 0);
        require(_goal >= 0);
        require(_goal <= _cap);
        require(_minInvest >= 0);
        require(_maxInvest > 0);
        require(_minInvest <= _maxInvest);
        require(_maxGasPrice > 0);
        require(_maxCallFrequency >= 0);

        startTime = _startTime;
        endTime = _endTime;
        rate = _rate;
        cap = _cap;
        goal = _goal;
        minInvest = _minInvest;
        maxInvest = _maxInvest;
        maxGasPrice = _maxGasPrice;
        maxCallFrequency = _maxCallFrequency;
        wallet = _wallet;

        token = new QiibeeToken();
        vault = new RefundVault(wallet);

        QiibeeToken(token).pause();

    }

    // fallback function can be used to buy tokens
    function () payable whenNotPaused {
      buyTokens(msg.sender);
    }

    /*
     * @dev Creates the token to be sold. Override this method to have crowdsale of a specific mintable token.
     */
    function createTokenContract() internal returns(QiibeeToken) {
        return new QiibeeToken(); //TODO: get token already deployed?
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
     * @param beneficiary beneficiary address where tokens are sent to
     */
    function buyTokens(address beneficiary) public payable {
        require(beneficiary != address(0));
        require(validPurchase());

        uint256 rate = getRate();
        uint256 tokens = msg.value.mul(rate);

        // check limits
        uint256 newBalance = balances[beneficiary].add(msg.value);
        require(newBalance <= maxInvest && msg.value >= minInvest);

        // spam prevention. TODO: needed for the presale?
        require(now.sub(lastCallTime[msg.sender]) >= maxCallFrequency);
        require(tx.gasprice <= maxGasPrice);
        lastCallTime[msg.sender] = now;

        // update state
        weiRaised = weiRaised.add(msg.value);
        tokensSold = tokensSold.add(tokens);

        //TODO: vest tokens?

        token.mint(beneficiary, tokens);

        TokenPurchase(msg.sender, beneficiary, msg.value, tokens);

        forwardFunds();
    }

    // @return true if investors can buy at the moment
    function validPurchase() internal constant returns (bool) {
      bool withinPeriod = now >= startTime && now <= endTime;
      bool withinCap = weiRaised.add(msg.value) <= cap;
      bool nonZeroPurchase = msg.value != 0;
      return withinPeriod && withinCap && nonZeroPurchase;
    }

    // @return true if crowdsale event has ended
    function hasEnded() public constant returns (bool) {
      bool capReached = weiRaised >= cap;
      return now > endTime || capReached;
    }

    function goalReached() public constant returns (bool) {
      return weiRaised >= goal;
    }

    // In addition to sending the funds, we want to call
    // the RefundVault deposit function
    function forwardFunds() internal {
      vault.deposit.value(msg.value)(msg.sender);
    }

    // if crowdsale is unsuccessful, investors can claim refunds here
    function claimRefund() public {
      require(isFinalized);
      require(!goalReached());

      vault.refund(msg.sender);
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
     * @dev Pauses the token. Only the owner can call this function.
     */
    function finalization() internal {
        uint256 crowdsaleSupply = token.totalSupply();
        uint256 foundationSupply = TOTAL_SUPPLY.sub(crowdsaleSupply);
        token.mint(wallet, foundationSupply);

        if (goalReached()) {
          vault.close();
        } else {
          vault.enableRefunds();
        }
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

}
