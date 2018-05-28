pragma solidity ^0.4.21;

import "openzeppelin-solidity/contracts/crowdsale/distribution/FinalizableCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/CappedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/TimedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "./Vault.sol";

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
  function totalSupply() returns (uint256);
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

contract QiibeeCrowdsale is TimedCrowdsale, CappedCrowdsale, FinalizableCrowdsale, Pausable {

    using SafeMath for uint256;

    QiibeeToken public token; // token being sold

    uint256 public tokensSold; // qbx minted (and sold)

    mapping (address => uint256) public balances; // balance of wei invested per contributor

    // spam prevention
    uint256 public maxGasPrice; // max gas price per transaction

    // bonus
    uint256 public bonusEndtime; // date where bonus is over
    mapping (address => bool) public bonus; // contributors who are entitled to the bonus
    mapping (address => bool) public existsBonus;

    // limits
    uint256 public minContrib; // minimum invest in wei an address can do
    uint256 public maxCumulativeContrib; // maximum cumulative invest an address can do


    Vault public vault; // vault used to hold funds while crowdsale is running
    // mapping (address => uint256) public deposited; //Money deposited per contributor
    mapping (address => bool) public rejected; // contributors that have been reject KYC
    mapping (address => bool) public accepted; // contributors that have been accepted KYC

    /*
     * @dev event for change wallet logging
     * @param wallet new wallet address
     */
    event WalletChange(address wallet);

    /* TODO: modify text
     * @dev event for contribution received
     * @param beneficiary contributor address
     * @param beneficiary amoount invested
     */
    event Released(address beneficiary, uint256 weiAmount);

    /*
     * @dev event for contribution refunded
     * @param beneficiary contributor address
     * @param beneficiary amoount invested
     */
    event PartialRefund(address beneficiary, uint256 amount);

    /* //TODO FIX TEXT
     * @dev event for contribution refunded
     * @param beneficiary contributor address
     * @param beneficiary amoount invested
     */
    event Refunded(address beneficiary, uint256 amount);

    /*
     * @dev Constructor. Creates the token in a paused state
     * @param _openingTime see `openingTime`
     * @param _closingTime see `closingTime`
     * @param _rate see `rate` on Crowdsale.sol
     * @param _cap see `see cap`
     * @param _minContrib see `see minContrib`
     * @param _maxCumulativeContrib see `see maxCumulativeContrib`
     * @param _maxGasPrice see `see maxGasPrice`
     * @param _token see `token`
     * @param _wallet see `wallet`
     */
    function QiibeeCrowdsale (
        uint256 _openingTime,
        uint256 _closingTime,
        uint256 _rate,
        uint256 _cap,
        uint256 _minContrib,
        uint256 _maxCumulativeContrib,
        uint256 _maxGasPrice,
        address _token,
        address _wallet
    ) public
      Crowdsale(_rate, _wallet, ERC20(_token))
      TimedCrowdsale(_openingTime, _closingTime)
      CappedCrowdsale(_cap)
    {
        require(_minContrib > 0);
        require(_minContrib < cap);
        require(_maxCumulativeContrib > 0);
        require(_minContrib <= _maxCumulativeContrib);
        require(_maxGasPrice > 0);

        bonusEndtime = _openingTime + 7 days;
        minContrib = _minContrib;
        maxCumulativeContrib = _maxCumulativeContrib;
        maxGasPrice = _maxGasPrice;
        token = QiibeeToken(_token);
        vault = new Vault(wallet);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier capNotReached() {
      require(weiRaised < cap);
      _;
    }

    function _preValidatePurchase(address _beneficiary, uint256 _weiAmount) internal {
        require(_beneficiary != address(0));
        require(_weiAmount != 0);
        require(block.timestamp >= openingTime && block.timestamp <= closingTime);
    }

    /*
     * @dev Whenever buyTokens function is called there are 3 use cases that can take place:
     * 1). if contributor has already passed KYC (this means that accepted[beneficiary] is true),
     * a normal purchase is done (funds go to qiibee wallet and tokens are minted (see _mintTokens
     * function)
     * 2). if contributor has been REJECTED from KYC (this means that rejected[beneficiary] is true),
     * funds are immediately refunded to the user and NO minting is performed.
     * 3). if contributor has never gone through the KYC process (this means that both
     * accepted[beneficiary] and rejected[beneficiary] are false) the funds are deposited in a vault
     * until the contract knows whether the contributor has passed the KYC or not.
     * @param beneficiary address where tokens will be sent to in case of acceptance
     */
    function buyTokens(address beneficiary) public payable whenNotPaused capNotReached {
        _preValidatePurchase(beneficiary, msg.value);
        _checkLimits(beneficiary, msg.value);

        if (accepted[beneficiary]) { // contributor has been accepted in the KYC process
            _mintTokens(beneficiary, msg.value);
        } else {
            if (rejected[beneficiary]) { // contributor has been rejected in the KYC process
                wallet.transfer(msg.value); // refund money to contributor
                Refunded(beneficiary, msg.value);
            } else { // contributor has not gone through the KYC process yet
                bonus[beneficiary] = _checkBonus(beneficiary);
                vault.deposit.value(msg.value)(beneficiary);
            }
        }
    }

    /****
     * TODO: FIX BUG (or let it be): Let's say Alice invests on 1st week, so bonus[Alice] = true but she does not
     * manage to schedule the KYC call during that week. Then, she invests more on the 2nd week.
     * Here is when bonus[Alice] is replaced by false.
     * Later on, she goes through the KYC process (getting accepted) so her funds of the 2
     * contributions (that are are deposited in the vault) are released but she does not receive
     * the tokens of the contribution she made during the 1st week.
     * MANUAL FIX: This situation is quite unlikely to happen but, if it happens, we can manually
     * distribute the bonus tokens to the contributor afterwards.
     * SOLUTION: TODO.
     ****/

     /****
     * TODO: If last contribution goes over the cap, allow it but refund the remaining amount.
     ****/

    /*
     * @dev this function is trigger by the owner to validate or reject an contributor's purchase. If
     * acceptance is true there are 2 use cases that can take place:
     * 1). if contributor has previously tried contributing (so he has his funds in the vault), we add
     * him/her to the accepted array and call _mintTokens() function.
     * 2). if contributor has never tried contributing yet (so he has no funds in the vault), we just add
     * him/her to the accepted array.
     * If acceptance is false, there are again 2 use cases:
     * 1). if contributor has previously tried contributing (so he has his funds in the vault), we add
     * him/her to the rejected array and refund him/her.
     * 2). if contributor has never tried contributing yet (so he has no funds in the vault), we just add
     * him/her to the rejected array.
     * @param beneficiary address where tokens are sent to
     * @param acceptance whether the user has passed KYC or not
     */
    function validatePurchase(address beneficiary, bool acceptance) onlyOwner public whenNotPaused {
        require(beneficiary != address(0));
        uint256 deposited = vault.deposited(beneficiary); // wei deposited by contributor TODO: cant make it work
        if (acceptance) {
            accepted[beneficiary] = true; // Add contributor to KYC array so if he reinvests he automatically gets the tokens. //TODO: beneficiary or sender?
            rejected[beneficiary] = false; // Add contributor to KYC array so if he reinvests he automatically gets the tokens. //TODO: beneficiary or sender?
            if (deposited > 0) {
              _mintTokens(beneficiary, deposited);
            }
        } else {
            rejected[beneficiary] = true; // Add contributor to KYC array so if he reinvests he automatically gets the tokens. //TODO: beneficiary or sender?
            accepted[beneficiary] = false;
            if (deposited > 0) {
              vault.refund(beneficiary);
            }
        }
    }

    /*
     * @dev checks whether corresponds to receive a bonus or not.
     * @param beneficiary address where tokens will be sent to in case of acceptance
     */
    function _checkBonus(address beneficiary) internal returns (bool) {
        if (now <= bonusEndtime) { // applies for the bonus
            return  true;
        } else {
            return false;
        }
    }

    /*
     * @dev If user has passed KYC, release funds and mint QBX. Otherwise, send back money.
     * @param beneficiary address where tokens are sent to
     * @param acceptance whether the user has passed KYC or not
     */
    function _mintTokens(address beneficiary, uint256 weiAmount) public {
        _checkLimits(beneficiary, weiAmount);

        uint256 deposited = vault.deposited(beneficiary); // wei deposited by contributor
        uint256 newBalance = weiRaised.add(weiAmount);
        uint256 overflow;

        if (newBalance > cap) {

            overflow = newBalance.sub(cap);
            uint256 available = weiAmount.sub(overflow);
            assert(available > 0);
            weiAmount = available;
        }

        uint256 tokens = weiAmount.mul(rate);

        if (_checkBonus(beneficiary) || bonus[beneficiary]) {
            tokens = tokens.mul(105).div(100); // adds 5% on top
            bonus[beneficiary] = false; // reset bonus
        }

        assert(QiibeeToken(token).mint(beneficiary, tokens));

        weiRaised = weiRaised.add(weiAmount);
        tokensSold = tokensSold.add(tokens);

        if (deposited > 0) { // if contributor has his funds in the vault, release them to qiibee
            vault.release(beneficiary, overflow);
        } else {
            wallet.transfer(weiAmount); // forward funds to qiibee wallet
            Released(beneficiary, weiAmount);
        }
        TokenPurchase(msg.sender, beneficiary, weiAmount, tokens);
    }

    /*
     * Checks if the contribution made is within the allowed limits
     */
    function _checkLimits(address beneficiary, uint256 weiAmount) internal {
        uint256 newBalance = balances[beneficiary].add(weiAmount);
        require(newBalance <= maxCumulativeContrib && weiAmount >= minContrib);
        require(tx.gasprice <= maxGasPrice);
    }

    /*
     * @dev Overrides Crowdsale#finalization() and is in charge of minting 49% percent of
     * the tokens to the qiibee foundation wallet
     */
    function finalization() internal {
        uint256 totalSupply = QiibeeToken(token).totalSupply(); // 51%
        uint256 foundationSupply = totalSupply.mul(49).div(51); // 49%
        QiibeeToken(token).mint(wallet, foundationSupply);
        vault.refundAll(); //TODO: decide if we want to refund here or we do it later
        super.finalization();
    }

    /**
      @dev Finalizes the crowdsale, calls finalization method (see `finalization()`),
      unpauses the token and transfers the token ownership to the foundation.
      This function can only be called once the crowdsale has ended.
    */
    function finalize() onlyOwner public {
        require(!isFinalized);
        require(hasClosed());

        finalization();
        Finalized();

        isFinalized = true;

        QiibeeToken(token).finishMinting(); //TODO: decide if we want to finish minting here
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
