pragma solidity ^0.4.11;

import "./RefundableOnTokenCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/Crowdsale.sol";
import "./QiibeeToken.sol";

/**
   @title Presale event

   Implementation of the presale event. This event will start when the owner calls the `unpause()`
   function and will end when it paused again.

   There is a cap expressed in wei and a whitelist, meaning that only investors in that list are
   allowed to send their investments.

   Funds raised during this presale will be transfered to `wallet`.

 */

contract QiibeePresale is Ownable, Pausable {

    using SafeMath for uint256;

    // maximum amount of qbx (in atto) that can be minted
    uint256 public cap;

    // total amount of wei raised
    uint256 public weiRaised;

    // address where funds will be sent
    address public wallet;

    // list of addresses that can invest during presale
    mapping (address => bool) public whitelist;

    /*
     * @dev Constructor of the presale. Creates the presale in a paused state
     * @param _cap see `see cap`
     * @param _wallet see `wallet`
     */
    function QiibeePresale(
        uint256 _cap,
        address _wallet
    ){
        require(_cap > 0);

        cap = _cap;
        wallet = _wallet;
        pause();
    }

    /*
     * @dev Fallback function that will be executed every time the contract
     * receives ether, the contract will accept ethers if the sender is whitelisted
     * and when the value plus the amount already raised is not over the cap.
     * ONLY send from a ERC20 compatible wallet like myetherwallet.com
     */
    function () whenNotPaused payable {
      require(weiRaised.add(msg.value) <= cap);
      require(isWhitelisted(msg.sender));

      weiRaised = weiRaised.add(msg.value);
      wallet.transfer(msg.value);
    }

    /*
     * @dev Add an address to the whitelist.
     */
    function addToWhitelist(address buyer) public onlyOwner {
        require(buyer != 0x0);
        whitelist[buyer] = true;
    }

    /*
     * @dev checks if an address is whitelisted
     * @return true if buyer is whitelisted
     */
    function isWhitelisted(address buyer) public constant returns (bool) {
        return whitelist[buyer];
    }

}
