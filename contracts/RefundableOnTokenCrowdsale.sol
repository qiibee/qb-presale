pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/crowdsale/FinalizableCrowdsale.sol";
import "zeppelin-solidity/contracts/crowdsale/RefundVault.sol";

/**
 * @title RefundableCrowdsale
 * @dev Extension of Crowdsale contract that adds a funding goal, and
 * the possibility of users getting a refund if goal is not met.
 * Uses a RefundVault as the crowdsale's vault.
 */
contract RefundableOnTokenCrowdsale is FinalizableCrowdsale {
  using SafeMath for uint256;

  enum State { Active, Refunding, Closed }

  // minimum amount of qbx (in atto) to be sold
  uint256 public goal;

  // refund vault used to hold funds while crowdsale is running
  RefundVault public vault;

  // Amount of qbx minted and transferred during the TGE
  uint256 public tokensSold;

  function RefundableOnTokenCrowdsale(uint256 _goal) {
    require(_goal > 0);
    vault = new RefundVault(wallet);
    goal = _goal;
  }

  // We're overriding the fund forwarding from Crowdsale.
  // In addition to sending the funds, we want to call
  // the RefundVault deposit function
  function forwardFunds() internal {
    vault.deposit.value(msg.value)(msg.sender);
  }

  function getVaultState() public constant returns (RefundVault.State) {
    return vault.state();
  }

  // if crowdsale is unsuccessful, investors can claim refunds here
  function claimRefund() {
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

    super.finalization();
  }

  function goalReached() public constant returns (bool) {
    return tokensSold >= goal; //TODO: is it okay >= or i have to use .gt()
  }

}
