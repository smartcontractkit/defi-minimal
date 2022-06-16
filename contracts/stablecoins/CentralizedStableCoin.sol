// SPDX-License-Identifier: MIT

// Based off:
// https://github.com/centrehq/centre-tokens/blob/master/contracts/v2/FiatTokenV2.sol
// https://github.com/centrehq/centre-tokens/blob/master/contracts/v1/FiatTokenV1.sol
// aka USDC
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error CentralizedStablecoin__NotMinter();
error CentralizedStablecoin__AddressBlacklisted();
error CentralizedStablecoin__NotZeroAddress();
error CentralizedStablecoin__AmountMustBeMoreThanZero();
error CentralizedStablecoin__ExceededMinterAllowance();
error CentralizedStablecoin__BurnAmountExceedsBalance();

contract CentralizedStableCoin is ERC20Burnable, Ownable {
    mapping(address => bool) internal s_blacklisted;
    mapping(address => bool) internal s_minters;
    mapping(address => uint256) internal s_minterAllowed;

    // Events
    event MinterConfigured(address indexed minter, uint256 minterAllowedAmount);
    event MinterRemoved(address indexed oldMinter);
    event Blacklisted(address indexed _account);
    event UnBlacklisted(address indexed _account);

    // Modifiers
    modifier onlyMinters() {
        if (!s_minters[msg.sender]) {
            revert CentralizedStablecoin__NotMinter();
        }
        _;
    }

    modifier notBlacklisted(address addressToCheck) {
        if (s_blacklisted[addressToCheck]) {
            revert CentralizedStablecoin__AddressBlacklisted();
        }
        _;
    }

    constructor(uint256 initialSupply) ERC20("CentralizedStablecoin", "CSC") {
        _mint(msg.sender, initialSupply);
    }

    function mint(address _to, uint256 _amount)
        external
        onlyMinters
        notBlacklisted(msg.sender)
        notBlacklisted(_to)
        returns (bool)
    {
        if (_to == address(0)) {
            revert CentralizedStablecoin__NotZeroAddress();
        }
        if (_amount <= 0) {
            revert CentralizedStablecoin__AmountMustBeMoreThanZero();
        }

        uint256 mintingAllowedAmount = s_minterAllowed[msg.sender];
        if (_amount <= mintingAllowedAmount) {
            revert CentralizedStablecoin__ExceededMinterAllowance();
        }
        _mint(msg.sender, mintingAllowedAmount);
        return true;
    }

    function burn(uint256 _amount) public override onlyMinters notBlacklisted(msg.sender) {
        uint256 balance = balanceOf(msg.sender);
        if (_amount <= 0) {
            revert CentralizedStablecoin__AmountMustBeMoreThanZero();
        }
        if (balance < _amount) {
            revert CentralizedStablecoin__BurnAmountExceedsBalance();
        }
        _burn(msg.sender, _amount);
    }

    /***************************/
    /* Minter settings */
    /***************************/

    function configureMinter(address minter, uint256 minterAllowedAmount)
        external
        onlyOwner
        returns (bool)
    {
        s_minters[minter] = true;
        s_minterAllowed[minter] = minterAllowedAmount;
        emit MinterConfigured(minter, minterAllowedAmount);
        return true;
    }

    function removeMinter(address minter) external onlyOwner returns (bool) {
        s_minters[minter] = false;
        s_minterAllowed[minter] = 0;
        emit MinterRemoved(minter);
        return true;
    }

    /***************************/
    /* Blacklisting Functions */
    /***************************/

    function isBlacklisted(address _account) external view returns (bool) {
        return s_blacklisted[_account];
    }

    function blacklist(address _account) external onlyOwner {
        s_blacklisted[_account] = true;
        emit Blacklisted(_account);
    }

    function unBlacklist(address _account) external onlyOwner {
        s_blacklisted[_account] = false;
        emit UnBlacklisted(_account);
    }

    /***************************/
    /* Blacklisting overrides */
    /***************************/

    function approve(address spender, uint256 value)
        public
        override
        notBlacklisted(msg.sender)
        notBlacklisted(spender)
        returns (bool)
    {
        super.approve(spender, value);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    )
        public
        override
        notBlacklisted(msg.sender)
        notBlacklisted(from)
        notBlacklisted(to)
        returns (bool)
    {
        super.transferFrom(from, to, value);
        return true;
    }

    function transfer(address to, uint256 value)
        public
        override
        notBlacklisted(msg.sender)
        notBlacklisted(to)
        returns (bool)
    {
        super.transfer(msg.sender, value);
        return true;
    }
}
