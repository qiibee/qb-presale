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

  /*
   * @dev Constructor. Sets the goal (soft cap) for the crowdsale.
   * @param _goal goal (soft cap) that crowdsale has.
  */
  function RefundableOnTokenCrowdsale(uint256 _goal) {
    require(_goal > 0);
    vault = new RefundVault(wallet);
    goal = _goal;
  }

  /*
   * @dev Forward funds to a RefundVault so as a mechanism to be able to claim funds later.
   * Overrides Crowdsale#forwardFunds() so it deposits funds in the RefundVault.
  */
  function forwardFunds() internal {
    vault.deposit.value(msg.value)(msg.sender);
  }

  /*
   * @dev Gets the current state of the RefundVault.
   * @return 0, 1 or 2 according the current state of the RefundVault.
  */
  function getVaultState() public constant returns (RefundVault.State) {
    return vault.state();
  }

  /*
   * @dev Function to claim funds made by the sender. It can be called only if the crowdsale is
   * finalized and the goal has not been reached.
  */
  function claimRefund() {
    require(isFinalized);
    require(!goalReached());

    vault.refund(msg.sender);
  }

  /*
   * @dev Finalization task, called when finalize() is called. Checks if goal has been reached or
   * not and closes or enables refunding accordingly.
  */
  function finalization() internal {
    if (goalReached()) {
      vault.close();
    } else {
      vault.enableRefunds();
    }

    super.finalization();
  }

  /*
   * @dev Checks if the goal has been reached (this means if tokensSold is greater of equal than
   the goal).
  */
  function goalReached() public constant returns (bool) {
    return tokensSold >= goal; //TODO: is it okay >= or i have to use .gt()
  }

}
