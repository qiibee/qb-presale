pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "zeppelin-solidity/contracts/crowdsale/RefundVault.sol";
import "./QiibeeToken.sol";

/**
   @title Presale event

   Implementation of the presale event. This event will start when the owner calls the `unpause()`
   function and will end when it paused again.

   There is a cap expressed in wei and a whitelist, meaning that only investors in that list are
   allowed to send their investments.

   Funds raised during this presale will be transfered to `wallet`.

 */

contract QiibeePresale is Pausable {

    using SafeMath for uint256;

    struct AccreditedInvestor {
      uint256 rate;
      uint64 cliff;
      uint64 vesting;
      uint256 minInvest;
      uint256 maxInvest;
    }

    uint256 public startTime;
    uint256 public endTime;

    uint256 public cap;
    uint256 public goal; // minimum amount of funds to be raised in weis
    RefundVault public vault; // refund vault used to hold funds while crowdsale is running

    QiibeeToken public token; // token being sold
    uint256 public tokensSold; // qbx minted (and sold)
    uint256 public weiRaised; // raised money in wei
    mapping (address => uint256) public balances; //balance of wei invested per investor

    // spam prevention
    mapping (address => uint256) public lastCallTime; // last call times by address
    uint256 public maxGasPrice; // max gas price per transaction
    uint256 public maxCallFrequency; // max frequency for purchases from a single source (in seconds)

    mapping (address => AccreditedInvestor) public accredited; // whitelist of investors

    bool public isFinalized = false;

    address public wallet; // address where funds are collected

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
     * @dev Constructor of the presale.
     * @param _cap see `see cap`
     * @param _wallet see `wallet`
     */
    function QiibeePresale(
        uint256 _startTime,
        uint256 _endTime,
        uint256 _maxGasPrice,
        uint256 _maxCallFrequency,
        uint256 _goal,
        uint256 _cap,
        address _wallet
    )
    {
        require(_startTime >= now);
        require(_endTime >= _startTime);
        require(_maxGasPrice > 0);
        require(_maxCallFrequency >= 0);
        require(_goal >= 0);
        require(_cap > 0);
        require(_goal <= _cap);
        require(_wallet != address(0));

        startTime = _startTime;
        endTime = _endTime;
        maxGasPrice = _maxGasPrice;
        maxCallFrequency = _maxCallFrequency;
        cap = _cap;
        goal = _goal;
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
     * @dev Low level token purchase function.
     * @param beneficiary beneficiary address where tokens are sent to
     */
    function buyTokens(address beneficiary) public payable whenNotPaused{
        require(beneficiary != address(0));
        require(validPurchase());

        AccreditedInvestor storage data = accredited[msg.sender];

        uint256 rate = data.rate;
        uint256 minInvest = data.minInvest;
        uint256 maxInvest = data.maxInvest;
        uint64 current = uint64(now);
        uint64 cliff = current + data.cliff;
        uint64 vesting = cliff + data.vesting;
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

        // vest tokens TODO: check last two params
        if (data.cliff > 0 && data.vesting > 0) {
          token.grantVestedTokens(beneficiary, tokens, current, cliff, vesting, false, false);
        }

        token.mint(beneficiary, tokens);

        TokenPurchase(msg.sender, beneficiary, msg.value, tokens);

        forwardFunds();
    }

    /*
     * @dev Add an address to the accredited list.
     */
    function addAccreditedInvestor(address buyer, uint256 rate, uint64 cliff, uint64 vesting, uint256 minInvest, uint256 maxInvest) public onlyOwner {
        require(buyer != address(0));
        require(rate > 0);
        require(cliff >= 0);
        require(vesting >= 0);
        require(minInvest >= 0);
        require(maxInvest > 0);

        accredited[buyer] = AccreditedInvestor(rate, cliff, vesting, minInvest, maxInvest);

        NewAccreditedInvestor(msg.sender, buyer);
    }

    /*
     * @dev checks if an address is accredited
     * @return true if investor is accredited
     */
    function isAccredited(address investor) public constant returns (bool) {
        AccreditedInvestor storage data = accredited[investor];
        return data.rate > 0; //TODO: is there any way to check this?
    }

    // @return true if investors can buy at the moment
    function validPurchase() internal constant returns (bool) {
      require(isAccredited(msg.sender));

      bool withinPeriod = now >= startTime && now <= endTime;
      bool withinCap = weiRaised.add(msg.value) <= cap;
      bool nonZeroPurchase = msg.value != 0;
      return withinPeriod && nonZeroPurchase && withinCap;
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

    // vault finalization task, called when owner calls finalize()
    function finalization() internal {
      if (goalReached()) {
        vault.close();
      } else {
        vault.enableRefunds();
      }
    }

    /**
     * @dev Must be called after crowdsale ends, to do some extra finalization
     * work. Calls the contract's finalization function.
     */
    function finalize() onlyOwner public {
      require(!isFinalized);
      require(hasEnded());

      finalization();
      Finalized();

      isFinalized = true;

      // transfer the ownership of the token to the foundation
      token.transferOwnership(wallet);
    }

}
