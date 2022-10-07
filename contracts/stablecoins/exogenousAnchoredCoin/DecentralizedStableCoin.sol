// SPDX-License-Identifier: MIT

// This is veeeeeeery loosely based off https://github.com/makerdao/dss (DAI)

// This is considered an Exogenous, Decentralized, Anchored (pegged), Crypto Collateralized low volitility coin

// Collateral: Exogenous
// Minting (Stability Mechanism): Decentralized (Algorithmic)
// Value (Relative Stability): Anchored (Pegged to USD)
// Collateral Type: Crypto

// ExoDRCCoin... Which I'm going to call ExoDaCCoin... ExoDac?

// Sometimes refered to just as "Crypto Collateralized Stablecoin" or "Decentralized Stablecoin"

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error DecentralizedStableCoin__AmountMustBeMoreThanZero();
error DecentralizedStableCoin__BurnAmountExceedsBalance();
error DecentralizedStableCoin__NotZeroAddress();

contract DecentralizedStableCoin is ERC20Burnable, Ownable {
    constructor() ERC20("DecentralizedStableCoin", "DSC") {}

    function burn(uint256 _amount) public override onlyOwner {
        uint256 balance = balanceOf(msg.sender);
        if (_amount <= 0) {
            revert DecentralizedStableCoin__AmountMustBeMoreThanZero();
        }
        if (balance < _amount) {
            revert DecentralizedStableCoin__BurnAmountExceedsBalance();
        }
        super.burn(_amount);
    }

    function mint(address _to, uint256 _amount) external onlyOwner returns (bool) {
        if (_to == address(0)) {
            revert DecentralizedStableCoin__NotZeroAddress();
        }
        if (_amount <= 0) {
            revert DecentralizedStableCoin__AmountMustBeMoreThanZero();
        }
        _mint(_to, _amount);
        return true;
    }
}
