// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "../amm/uniswap-v2/core/UniswapV2ERC20.sol";

contract MockUniswapV2ERC20 is UniswapV2ERC20 {
    constructor(uint256 _totalSupply) {
        _mint(msg.sender, _totalSupply);
    }
}
