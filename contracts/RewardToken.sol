// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract RewardToken is ERC20 {
    constructor() ERC20("Reward Token", "RT") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}
