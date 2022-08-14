// SPDX-License-Identifier: MIT
// Inspired by https://solidity-by-example.org/defi/uniswap-v2/

pragma solidity ^0.8.7;

// This is not a full swapping contract, but an implementation of how to interact with uniswap or a uniswap clone
contract TestUniswap {
    address private constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    function swap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _amountOutMin,
        address _to
    ) external {
        IERC20(_tokenIn).transferFrom(msg.sender, address(this), _amountIn);
        IERC20(_tokenIn).approve(UNISWAP_V2_ROUTER, _amountIn);

        address[] memory path;
        if (_tokenIn == WETH || _tokenOut == WETH) {
            path = new address[](2);
            path[0] = _tokenIn;
            path[1] = _tokenOut;
        } else {
            path = new address[](3);
            path[0] = _tokenIn;
            path[1] = WETH;
            path[2] = _tokenOut;
        }

        IUniswapV2Router(UNISWAP_V2_ROUTER).swapExactTokensForTokens(
            _amountIn,
            _amountOutMin,
            path,
            _to,
            block.timestamp
        );
    }
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IERC20 {
    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}

// License
// MIT License

// Copyright (c) 2018 Tasuku Nakamura

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
