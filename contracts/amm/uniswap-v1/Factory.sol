//SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./Exchange.sol";

/**
 * THIS IS AN EXAMPLE CONTRACT WHICH IS NOT AUDITED
 * PLEASE DO NOT USE THIS CODE IN PRODUCTION.
 */
contract Factory {
    mapping(address => address) public exchanges;

    /**
     * Create and deploy a new exchange
     *
     * @param tokenAddress address: Token address for which the factory will create an exchange
     * @return exchangeAddress address: Token/ETH Exchange address
     * @notice a similar exchange must not exist
     */
    function createExchange(address tokenAddress) public returns (address exchangeAddress) {
        require(tokenAddress != address(0), "Token address not valid");
        require(exchanges[tokenAddress] == address(0), "Exchange already exists");

        Exchange exchange = new Exchange(tokenAddress);
        exchanges[tokenAddress] = address(exchange);

        exchangeAddress = address(exchange);
    }

    /**
     * Find an exchange
     *
     * @param tokenAddress address: Token address for which the factory will create an exchange
     * @return exchangeAddress address: Token/ETH Exchange address
     */
    function getExchange(address tokenAddress) public view returns (address exchangeAddress) {
        exchangeAddress = exchanges[tokenAddress];
        require(exchangeAddress != address(0), "Exchange does exists");
    }
}
