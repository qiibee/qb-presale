pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/crowdsale/FinalizableCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/CappedCrowdsale.sol";
import "zeppelin-solidity/contracts/lifecycle/Pausable.sol";

contract QiibeeTokenInterface {
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
   @title Presale event

   Implementation of the QBX Presale Token Generation Event (PTGE): A X-week presale with a hard cap
   expressed in wei.

   This presale is only for accredited investors, who will have to be whitelisted by the owner
   using the `addAccreditedInvestor()` function. Each accredited investor has a minimum amount of wei
   for each one of his transactions, a maximum cumulative investment and vesting settings (cliff
   and vesting period).

   On each purchase, the corresponding amount of tokens will be minted and vested (if the investor
   has vesting settings).

   After fundraising is done (now > endTime or weiRaised >= cap) and before the presale is finished,
   the owner of the contract will distribute the tokens for the different pools by calling the
   `distributeTokens()` function.

 */

contract QiibeePresale is CappedCrowdsale, FinalizableCrowdsale, Pausable {

    using SafeMath for uint256;

    struct AccreditedInvestor {
      uint64 cliff;
      uint64 vesting;
      bool revokable;
      bool burnsOnRevoke;
      uint256 minInvest; // minimum invest in wei for a given investor
      uint256 maxCumulativeInvest; // maximum cumulative invest in wei for a given investor
    }

    QiibeeTokenInterface public token; // token being sold

    uint256 public distributionCap; // cap in tokens that can be distributed to the pools
    uint256 public tokensDistributed; // tokens distributed to pools
    uint256 public tokensSold; // qbx minted (and sold)

    uint64 public vestFromTime; // start time for vested tokens (equiv. to 30/06/2018 12:00:00 AM GMT)
    // uint64 public vestFromTime = 1530316800; // start time for vested tokens (equiv. to 30/06/2018 12:00:00 AM GMT)

    mapping (address => uint256) public balances; // balance of wei invested per investor
    mapping (address => AccreditedInvestor) public accredited; // whitelist of investors

    // spam prevention
    mapping (address => uint256) public lastCallTime; // last call times by address
    uint256 public maxGasPrice; // max gas price per transaction
    uint256 public minBuyingRequestInterval; // min request interval for purchases from a single source (in seconds)

    bool public isFinalized = false;

    event NewAccreditedInvestor(address indexed from, address indexed buyer);
    event TokenDistributed(address indexed beneficiary, uint256 tokens);

    /*
     * @dev Constructor.
     * @param _startTime see `startTimestamp`
     * @param _endTime see `endTimestamp`
     * @param _rate see `see rate`
     * @param _cap see `see cap`
     * @param _distributionCap see `see distributionCap`
     * @param _maxGasPrice see `see maxGasPrice`
     * @param _minBuyingRequestInterval see `see minBuyingRequestInterval`
     * @param _vestFromTime when does the vesting of tokens starts
     * @param _wallet see `wallet`
     */
    function QiibeePresale(
        uint256 _startTime,
        uint256 _endTime,
        address _token,
        uint256 _rate,
        uint256 _cap,
        uint256 _distributionCap,
        uint256 _maxGasPrice,
        uint256 _minBuyingRequestInterval,
        uint256 _vestFromTime,
        address _wallet
    )
      Crowdsale(_startTime, _endTime, _rate, _wallet)
      CappedCrowdsale(_cap)
    {
      require(_distributionCap > 0);
      require(_maxGasPrice > 0);
      require(_minBuyingRequestInterval > 0);
      require(_vestFromTime > 0);
      require(_token != address(0));

      distributionCap = _distributionCap;
      maxGasPrice = _maxGasPrice;
      minBuyingRequestInterval = _minBuyingRequestInterval;
      token = QiibeeTokenInterface(_token);
    }

    /*
     * @param beneficiary address where tokens are sent to
     */
    function buyTokens(address beneficiary) public payable whenNotPaused {
      require(beneficiary != address(0));
      require(validPurchase());

      AccreditedInvestor storage data = accredited[msg.sender];

      // investor's data
      uint256 minInvest = data.minInvest;
      uint256 maxCumulativeInvest = data.maxCumulativeInvest;
      uint64 from = vestFromTime;
      uint64 cliff = from + data.cliff;
      uint64 vesting = cliff + data.vesting;
      bool revokable = data.revokable;
      bool burnsOnRevoke = data.burnsOnRevoke;

      uint256 tokens = msg.value.mul(rate);

      // check investor's limits
      uint256 newBalance = balances[msg.sender].add(msg.value);
      require(newBalance <= maxCumulativeInvest && msg.value >= minInvest);

      if (data.cliff > 0 && data.vesting > 0) {
        require(QiibeeTokenInterface(token).mintVestedTokens(beneficiary, tokens, from, cliff, vesting, revokable, burnsOnRevoke, wallet));
      } else {
        require(QiibeeTokenInterface(token).mint(beneficiary, tokens));
      }

      // update state
      balances[msg.sender] = newBalance;
      weiRaised = weiRaised.add(msg.value);
      tokensSold = tokensSold.add(tokens);

      TokenPurchase(msg.sender, beneficiary, msg.value, tokens);

      forwardFunds();
    }

    /*
     * @dev This functions is used to manually distribute tokens. It works after the fundraising, can
     * only be called by the owner and when the presale is not paused. It has a cap on the amount
     * of tokens that can be manually distributed.
     *
     * @param _beneficiary address where tokens are sent to
     * @param _tokens amount of tokens (in atto) to distribute
     * @param _cliff duration in seconds of the cliff in which tokens will begin to vest.
     * @param _vesting duration in seconds of the vesting in which tokens will vest.
     */
    function distributeTokens(address _beneficiary, uint256 _tokens, uint64 _cliff, uint64 _vesting, bool _revokable, bool _burnsOnRevoke) public onlyOwner whenNotPaused {
      require(_beneficiary != address(0));
      require(_tokens > 0);
      require(_vesting >= _cliff);
      require(!isFinalized);
      require(hasEnded());

      // check distribution cap limit
      uint256 totalDistributed = tokensDistributed.add(_tokens);
      assert(totalDistributed <= distributionCap);

      if (_cliff > 0 && _vesting > 0) {
        uint64 from = vestFromTime;
        uint64 cliff = from + _cliff;
        uint64 vesting = cliff + _vesting;
        assert(QiibeeTokenInterface(token).mintVestedTokens(_beneficiary, _tokens, from, cliff, vesting, _revokable, _burnsOnRevoke, wallet));
      } else {
        assert(QiibeeTokenInterface(token).mint(_beneficiary, _tokens));
      }

      // update state
      tokensDistributed = tokensDistributed.add(_tokens);

      TokenDistributed(_beneficiary, _tokens);
    }

    /*
     * @dev Add an address to the accredited list.
     */
    function addAccreditedInvestor(address investor, uint64 cliff, uint64 vesting, bool revokable, bool burnsOnRevoke, uint256 minInvest, uint256 maxCumulativeInvest) public onlyOwner {
        require(investor != address(0));
        require(vesting >= cliff);
        require(minInvest > 0);
        require(maxCumulativeInvest > 0);
        require(minInvest <= maxCumulativeInvest);

        accredited[investor] = AccreditedInvestor(cliff, vesting, revokable, burnsOnRevoke, minInvest, maxCumulativeInvest);

        NewAccreditedInvestor(msg.sender, investor);
    }

    /*
     * @dev checks if an address is accredited
     * @return true if investor is accredited
     */
    function isAccredited(address investor) public constant returns (bool) {
        AccreditedInvestor storage data = accredited[investor];
        return data.minInvest > 0;
    }

    /*
     * @dev Remove an address from the accredited list.
     */
    function removeAccreditedInvestor(address investor) public onlyOwner {
        require(investor != address(0));
        delete accredited[investor];
    }


    /*
     * @return true if investors can buy at the moment
     */
    function validPurchase() internal constant returns (bool) {
      require(isAccredited(msg.sender));
      bool withinFrequency = now.sub(lastCallTime[msg.sender]) >= minBuyingRequestInterval;
      bool withinGasPrice = tx.gasprice <= maxGasPrice;
      return super.validPurchase() && withinFrequency && withinGasPrice;
    }

    /*
     * @dev Must be called after crowdsale ends, to do some extra finalization
     * work. Calls the contract's finalization function. Only owner can call it.
     */
    function finalize() public onlyOwner {
      require(!isFinalized);
      require(hasEnded());

      finalization();
      Finalized();

      isFinalized = true;

      // transfer the ownership of the token to the foundation
      QiibeeTokenInterface(token).transferOwnership(wallet);
    }

    /*
     * @dev sets the token that the presale will use. Can only be called by the owner and
     * before the presale starts.
     */
    function setToken(address tokenAddress) onlyOwner {
      require(now < startTime);
      token = QiibeeTokenInterface(tokenAddress);
    }

}
