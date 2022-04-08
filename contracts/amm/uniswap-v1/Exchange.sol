// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

/**
 * THIS IS AN EXAMPLE CONTRACT WHICH IS NOT AUDITED
 * PLEASE DO NOT USE THIS CODE IN PRODUCTION.
 */

interface IExchange {
    function ethToTokenSwap(uint256 expectedTokenAmount) external payable;

    function ethToTokenTransfer(uint256 expectedTokenAmount, address recipient) external payable;
}

interface IFactory {
    function getExchange(address tokenAddress) external returns (address);
}

contract Exchange is ERC20 {
    address public tokenAddress;
    address public factoryAddress;

    // events
    event TokenPurchase(address indexed buyer, uint256 indexed ethSold, uint256 tokenBought);
    event EthPurchase(address indexed buyer, uint256 indexed tokenSold, uint256 ethBought);
    event AddLiquidity(
        address indexed provider,
        uint256 indexed ethAmount,
        uint256 indexed tokenAmount
    );
    event RemoveLiquidity(
        address indexed provider,
        uint256 indexed ethAmount,
        uint256 indexed tokenAmount
    );

    constructor(address token) ERC20("Funkyswap V1", "FUNKY-V1") {
        require(token != address(0), "invalid token address");
        tokenAddress = token;
        factoryAddress = msg.sender;
    }

    /**
     * Called by liquidity providers. Must provide the same value of `tokenAmount` as `msg.value` in order to respect the current reserve ratio
     * reserve formula to respect: (tokenAmount/msg.value) = (tokenReserve/ethReserve)
     * @param tokenAmount uint256: input amount of token that liquidity provider is depositing
     * @return poolTokenAmount uint256: amount of pool token rewarded to the liquidity provider
     * @notice payable modifier: expect to receive `msg.value` ETH
     * @notice at initialization (when `tokenReserve` ==0) , allow the 1st liquidity provider to decide on the initial reserve ratio
     * @notice check that the liquidity provider has provided enough `tokenAmount` and take only what's needed (`expectedTokenAmount`)
     * @notice reward liquidity provider with pool tokens. Amount of tokens is proportional to the amout of eth provider comparatively to the total ETH reserve.
     */
    function addLiquidity(uint256 tokenAmount) public payable returns (uint256 poolTokenAmount) {
        // Retrieve reserves
        (uint256 tokenReserve, uint256 ethReserve) = getReserves();
        if (tokenReserve == 0) {
            // at initialization of the exchange, we accept whatever the 1st liquidity provider has given us
            IERC20 token = IERC20(tokenAddress);
            token.transferFrom(msg.sender, address(this), tokenAmount);
            // at initialization , pook token amount is equal to the amount of ethers
            poolTokenAmount = ethReserve;
        } else {
            // Substract msg.value from the balance before calling the getAmount function
            ethReserve = ethReserve - msg.value;
            // expected amount based on the current reserve ratio tokenReserve / ethReserve
            uint256 expectedtokenAmount = (msg.value * tokenReserve) / ethReserve;
            require(tokenAmount >= expectedtokenAmount, "Insufficient token amount");
            IERC20 token = IERC20(tokenAddress);
            token.transferFrom(msg.sender, address(this), expectedtokenAmount);
            // pool token amount based on ratio providedEth/ethReserve
            // (poolTokenAmount/totalPoolTokenSupply) = (depositedEth/ethReserve)
            poolTokenAmount = (totalSupply() * msg.value) / ethReserve;
        }
        // reward the liquidity provider with calculated pool tokens amount
        _mint(msg.sender, poolTokenAmount);
        emit AddLiquidity(msg.sender, msg.value, tokenAmount);
    }

    /**
     * Called by liquidity providers. Burn pool tokens in exchange of ETH & Tokens at current ratios.
     *
     * @param poolTokenAmount uint256: Amount of pool token to be burned
     * @return ethAmount uint256: Amount of ETH withdrawn
     * @return tokenAmount uint256: Amount of Tokens withdrawn
     */
    function removeLiquidity(uint256 poolTokenAmount)
        public
        returns (uint256 ethAmount, uint256 tokenAmount)
    {
        require(poolTokenAmount > 0, "Amount of pool token cannot be 0");
        // Retrieve reserves
        (uint256 tokenReserve, uint256 ethReserve) = getReserves();

        // calculate the amount of Token & ETH based on the ratio
        ethAmount = (ethReserve * poolTokenAmount) / totalSupply();
        tokenAmount = (tokenReserve * poolTokenAmount) / totalSupply();

        // reduce supply of pool tokens
        _burn(msg.sender, poolTokenAmount);
        // returns ETH & Token to the liquidity provider
        (bool sent, ) = (msg.sender).call{value: ethAmount}("");
        require(sent, "Failed to send Ether");
        IERC20(tokenAddress).transfer(msg.sender, tokenAmount);
        emit RemoveLiquidity(msg.sender, ethAmount, tokenAmount);
    }

    /**
     * @dev Pricing function `outputAmount` of token2 if we provide `inputAmount` of token1 in exchange.
     *
     * @param inputAmount uint256: Amount of token1 we are selling
     * @param inputReserve uint256: Reserve of token1 we are selling
     * @param outputReserve uint256: Reserve of token2 we are buying
     * @return outputAmount uint256: Amount of token2 we receive in exchange
     *
     * @notice fees taken intout account. 0,3 % fees . 0,3 % = 3/1000. Fees removed from `inputAmount`
     */
    function getAmount(
        uint256 inputAmount,
        uint256 inputReserve,
        uint256 outputReserve
    ) private pure returns (uint256 outputAmount) {
        require(inputReserve > 0 && outputReserve > 0, "Reserves cannot be null");
        uint256 inputAmountWithFee = inputAmount * 997;
        uint256 numerator = inputAmountWithFee * outputReserve;
        uint256 denominator = (1000 * inputReserve + inputAmountWithFee);

        outputAmount = numerator / denominator;
    }

    /**
     * Get `tokenAmount` if we provide `ethAmount` in exchange.
     *
     * @param ethAmount uint256: Amount of ETH we are selling
     * @return tokenAmount uint256: Amount of Token we receive in exchange
     */
    function getTokenAmount(uint256 ethAmount) public view returns (uint256 tokenAmount) {
        require(ethAmount > 0, "Eth amount cannot be null");

        // Retrieve reserves
        // Retrieve reserves
        (uint256 tokenReserve, uint256 ethReserve) = getReserves();

        // Trading ethAmount for tokenAmount (= Buy Token with Eth)
        tokenAmount = getAmount(ethAmount, ethReserve, tokenReserve);
    }

    /**
     * Get `ethAmount` if we provide `tokenAmount` in exchange.
     *
     * @param tokenAmount uint256: Amount of Token we are selling
     * @return ethAmount uint256: Amount of ETH we receive in exchange
     */
    function getEthAmount(uint256 tokenAmount) public view returns (uint256 ethAmount) {
        require(tokenAmount > 0, "Token amount cannot be null");

        // Retrieve reserves
        (uint256 tokenReserve, uint256 ethReserve) = getReserves();

        // Trading tokenAmount for ethAmount (= Sell Token for Eth)
        ethAmount = getAmount(tokenAmount, tokenReserve, ethReserve);
    }

    /**
     * Buy `expectedTokenAmount` in exchange of at least `msg.value` ETH
     *
     * @notice Protect users from front-running bots but asking them to provide `expectedTokenAmount`
     *
     * @param expectedTokenAmount uint256: Expected amount of token to be received by the user
     * @param recipient address: Recipient address
     */
    function ethToToken(uint256 expectedTokenAmount, address recipient) private {
        // Retrieve reserves
        (uint256 tokenReserve, uint256 ethReserve) = getReserves();

        uint256 tokenAmount = getAmount(msg.value, ethReserve - msg.value, tokenReserve);

        require(tokenAmount >= expectedTokenAmount, "Token Amount low");

        IERC20(tokenAddress).transfer(recipient, tokenAmount);
        emit TokenPurchase(recipient, msg.value, tokenAmount);
    }

    /**
     * Buy `expectedTokenAmount` in exchange of at least `msg.value` ETH
     *
     * @notice Because the function receives ETH , `msg.value` has been added to the ETH reserve. Hence, we need to subsctract it before calling the `getAmount` function
     * @notice Protect users from front-running bots but asking them to provide `expectedTokenAmount`
     *
     * @param expectedTokenAmount uint256: Expected amount of token to be received by the user
     * @param recipient address: Recipient address
     */
    function ethToTokenTransfer(uint256 expectedTokenAmount, address recipient) public payable {
        ethToToken(expectedTokenAmount, recipient);
    }

    /**
     * Buy `expectedTokenAmount` in exchange of at least `msg.value` ETH
     *
     * @notice Because the function receives ETH , `msg.value` has been added to the ETH reserve. Hence, we need to subsctract it before calling the `getAmount` function
     * @notice Protect users from front-running bots but asking them to provide `expectedTokenAmount`
     *
     * @param expectedTokenAmount uint256: Expected amount of token to be received by the user
     * @dev Calls `ethToToken()` . recipient is `msg.sender`
     */
    function ethToTokenSwap(uint256 expectedTokenAmount) public payable {
        ethToToken(expectedTokenAmount, msg.sender);
    }

    /**
     * Sell `tokenAmount` in exchange of at least `expectedEthAmount` ETH
     *
     * @notice Protect users from front-running bots but asking them to provide `expectedTokenAmount`
     *
     * @param tokenAmount uint256: Amount of Token sold to the Exchange
     * @param expectedEthAmount uint256: Expected amount of ETH to be received by the user
     */
    function tokenToEthSwap(uint256 tokenAmount, uint256 expectedEthAmount) public {
        // Retrieve reserves
        (uint256 tokenReserve, uint256 ethReserve) = getReserves();

        uint256 ethAmount = getAmount(tokenAmount, tokenReserve, ethReserve);

        require(ethAmount >= expectedEthAmount, "Eth Amount low");

        IERC20(tokenAddress).transferFrom(msg.sender, address(this), tokenAmount);
        (bool sent, ) = (msg.sender).call{value: ethAmount}("");
        require(sent, "Failed to send Ether");
        emit EthPurchase(msg.sender, tokenAmount, ethAmount);
    }

    /**
     * Sell `tokenAmount` in exchange for at least `expectedTargetTokenAmount` of target Token
     *
     * @dev ETH uses as a bridge. Token --> ETH --> Target Token
     *
     * @param tokenAmount uint256: Amount of Token sold to the Exchange
     * @param expectedTargetTokenAmount uint256: Expected amount of Target token to be received by the user
     * @param targetTokenAddress address: Target Token address
     */
    function tokenToTokenSwap(
        uint256 tokenAmount,
        uint256 expectedTargetTokenAmount,
        address targetTokenAddress
    ) public {
        require(targetTokenAddress != address(0), "Token address not valid");
        require(tokenAmount > 0, "Tokens amount not valid");
        address targetExchangeAddress = IFactory(factoryAddress).getExchange(targetTokenAddress);
        require(
            targetExchangeAddress != address(this) && targetExchangeAddress != address(0),
            "Exchange address not valid"
        );

        // Retrieve reserves
        (uint256 tokenReserve, uint256 ethReserve) = getReserves();
        uint256 ethAmount = getAmount(tokenAmount, tokenReserve, ethReserve);

        IERC20(tokenAddress).transferFrom(msg.sender, address(this), tokenAmount);

        IExchange(targetExchangeAddress).ethToTokenTransfer{value: ethAmount}(
            expectedTargetTokenAmount,
            msg.sender
        );
    }

    /**
     * Return reserves of Token & ETH within the exchange
     * @return tokenReserve uint256 : Exchange Token Balance
     * @return ethReserve uint256: Exchange ETH Balance
     */
    function getReserves() public view returns (uint256 tokenReserve, uint256 ethReserve) {
        // Retrieve reserves
        tokenReserve = IERC20(tokenAddress).balanceOf(address(this));
        ethReserve = address(this).balance;
    }
}
