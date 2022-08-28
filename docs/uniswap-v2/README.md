# Uniswap V2

> 📘 Start with [v1](../uniswap-v1/README.md) if you are not familiar with Uniswap.

Major improvements from [v1](../uniswap-v1/README.md):

-   Creation of arbitrary ERC20/ERC20 pairs. While with v1, you can only create pairs between ERC20 and ETH.
-   Hardened price oracle that accumulates the relative price of the two assets at the beginning of each block.
-   Flash swaps
-   Reducing the attack surface of Uniswap by splitting the logic into two repositories:
    -   core: holds the liquidity providers' funds. Implementation is kept minimal to mitigate the risk of bugs or attacks.
    -   periphery: interacts with the core. It contains router logic and features to support or protect traders.

## References:

-   [Uniswap v2 whitepaper](https://uniswap.org/whitepaper.pdf)
-   [Uniswap v2 official doc](https://docs.uniswap.org/protocol/V2/introduction)
-   [Ethereum foundation tutorial](https://ethereum.org/en/developers/tutorials/uniswap-v2-annotated-code/)
-   Uniswap v2 source code
    -   [core](https://github.com/Uniswap/v2-core)
    -   [periphery](https://github.com/Uniswap/v2-periphery)

## Guide

The original contracts and tests have been rewritten to support Solidity v8.7.0 and hardhat. The purpose is to help you walk through the original implementation.
The rewritten implementation can be found under:

-   Contracts
    -   core: `/contracts/amm/uniswap-v2/core/`
    -   periphery: `/contracts/amm/uniswap-v2/periphery/`
-   Tests
    -   `/test/amm/uniswap-v2/core/`
    -   `/test/amm/uniswap-v2/periphery/`

> 🏗 Periphery are WIP
> Only the core has been rewritten. Periphery is a work in progress.

### Core

#### UQ112x112.sol

Because Solidity does not have first-class support for non-integer numeric data types, Uniswap v2 uses a binary fixed point format to encode and manipulate prices.
You will note in UniswapV2Pair (see below) that `reserve0` and `reserve1` are stored as `uint112`. These numbers are divided to calculate the cumulative prices (see below). Hence prices are stored as `UQ112.112`: 112 bits for the integer part and 112 bits for the fraction part. Read [whitepaper p4](https://uniswap.org/whitepaper.pdf) for more details.

#### UniswapV2ERC20.sol

Implementation of ERC20 standard.

-   Inherits the [Openzepellin ERC20 contract](https://docs.openzeppelin.com/contracts/4.x/erc20) and add a `permit` functionality. Note that the [original implementation](https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2ERC20.sol) implements the whole ERC20 standard.
-   The `permit` function supports [meta-transaction](https://docs.uniswap.org/protocol/V2/guides/smart-contract-integration/supporting-meta-transactions/). Main use case is to allow the owner of an ERC20 token to sign a transaction off-chain. Anyone (e.g., recipient) can submit this signed transaction on behalf of the owner. If the signature is valid then an `_appove` call is made on behalf of the owner.

#### UniswapV2Factory.sol

Factory contract that creates pair exchanges.

-   Creates an ERC20-ERC20 pair exchanges (cf. UniswapV2Pair.sol) and acts as a registry of liquidity pools: see `getPair` mapping. E.g.: to find the pair exchange of `token0` to `token1` , you use `getPair[token0][token1]` (Note that `getPair[token1][token0]` works as well).
-   All the pairs created by the factory can be found in `allPairs` state variable.
-   `feeTo` and `feeToSetter` are necessary to implement protocol fees: At the launch of Uniswap V2, the protocol charge was 0, and the liquidity provider fee was 0.3%. If the protocol charge switches on, it will become 0.05%, and the liquidity provider fee will be 0.25% (**Note** the traders continue to pay 0.3% fees regardless of whether the protocol fee is active or not). Read :
    -   [path to sustainability](https://uniswap.org/blog/uniswap-v2#path-to-sustainability) to learn more.
    -   [Official docs - fees](https://docs.uniswap.org/protocol/V2/concepts/advanced-topics/fees)
-   Creation logic (`createPair`). Uniswap v2 uses `CREATE2` opcode (see [EIP1014](https://eips.ethereum.org/EIPS/eip-1014) , [Solidity by Example](https://solidity-by-example.org/app/create2/)) to generate a pair contract with a deterministic address:

    1. Tokens are sorted `(address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA)`
    2. Prevent dilution of liquidity by allowing creation of multiple liquidity pools for the same token pairs: `if (getPair[token0][token1] != address(0)) revert PairExists()`
    3. `CREATE2` used with the following arguments:

        - Uniswapv2 byte code: `type(UniswapV2Pair).creationCode`.
        - Salt which is `keccak256(abi.encodePacked(token0, token1))`. (this explains the sorting above).

    4. After creation, initialize the new exchange to set up the tokens addresses `IUniswapV2Pair(pair).initialize(token0, token1)`
    5. Save the new pair in `getPair` and `allPairs` then emit a `PairCreated` event.

#### UniswapV2Pair.sol

Note that any contract can call these functions. However, they are designed to be called from the periphery contract.

Liquidity pool that exchanges two tokens. Three main use cases:

-   `mint`: called when liquidity providers add liquidity (reserve tokens) and receive liquidity tokens in exchange.
-   `burn`: called when liquidity providers burn liquidity tokens and receive reserve tokens in exchange.
-   `swap`: called when traders swap a reserve token for the other reserve token. Paying 0,3% fees.

##### mint

1. Calls `getReserves` to fetch stored reserves.
2. Calculates how many tokens were sent to the contract. Which is the difference between the current contract balances and the stored reserves
    ```Solidity
     uint256 balance0 = IERC20(token0).balanceOf(address(this));
     uint256 balance1 = IERC20(token1).balanceOf(address(this));
     uint256 amount0 = balance0 - _reserve0;
     uint256 amount1 = balance1 - _reserve1;
    ```
    Note that the logic of sending tokens to the core contract is not present. As we will see later, it is implemented in the periphery contract. The core contract only expects tokens and doesn't need to know how it received them.
3. Call `_minFee` to check if fees are activated. If yes, then calculate the protocol fees. The logic behind the implementation is detailed in the [white paper, page 4](https://uniswap.org/whitepaper.pdf).
4. Fetch the current liquidity tokens supply by calling `totalSupply`.
    - If it is the very first deposit (`_totalSupply == 0`):
        - Liquidity tokens are the geometric mean of `amount0` and `amount1`. The main benefit of [geometric mean](https://www.mathsisfun.com/numbers/geometric-mean.html) is that the initial liquidity ratio doesn't affect the value of a pool share. For instance, depositing `6`, `6` of token0,token1 OR `2`, `18` of token0,token1 will give the same amount of liquidity tokens.
        - `MINIMUM_LIQUIDITY` of this liquidity is permanently locked `_mint(address(1), MINIMUM_LIQUIDITY` (which is `1000`). This protects from making one pool too expensive, which will prevent small liquidity providers from providing liquidity. **Note** in the original implementation, `MINIMUM_LIQUIDITY`is minted to the zero address `address(0)`. However, @openzeppelin prevents from minting to the zero address.
        - Rest `liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY` is sent to the liquidity provider `_mint(to, liquidity)`.
    - For subsequent deposits, the amount of liquidity tokens is proportional to the deposited amount.
        ```Solidity
           liquidity = Math.min(
                  (amount0 * _totalSupply) / _reserve0,
                  (amount1 * _totalSupply) / _reserve1
              )
        ```
        - **Note** As there are two tokens, choosing the minimum (`Math.min`) incentivizes liquidity providers to provide an equivalent proportion. They get punished if they provide unbalanced liquidity.
5. Mint the calculated `liquidity` `_mint(to, liquidity)`.
6. Update the stored reserves `_update(balance0, balance1, _reserve0, _reserve1)` and the cumulative prices (see later).
7. Update `klast` if fees are activated. The logic behind fees implementation can be found in [white paper page 4](https://uniswap.org/whitepaper.pdf).

##### burn

The logic is the opposite of `mint`. Here the pair contract expects to receive Liquidity tokens and returns reserve tokens in exchange.

1. Calls `getReserves` to fetch stored reserves.
2. Calculate the received liquidity `uint256 liquidity = balanceOf(address(this))`. A periphery contract manages the logic of sending liquidity tokens to the contract. At this point, the core contract doesn't need to know how it received the liquidity.
3. Call `_minFee` to check if fees are activated. If yes, then calculate the protocol fees. The logic behind the implementation is detailed in the [white paper page 4](https://uniswap.org/whitepaper.pdf).
4. Calculate the amount of token0 and token1 to be returned. It is proportional to the provided liquidity tokens:
    ```Solidity
    uint256 _totalSupply = totalSupply();
    amount0 = (liquidity * balance0) / _totalSupply;
    amount1 = (liquidity * balance1) / _totalSupply;
    ```
5. Burn the provided liquidity `_burn(address(this), liquidity)`
6. Send calculated tokens' amounts:

    ```Solidity
    IERC20(token0).safeTransfer(to, amount0);
    IERC20(token1).safeTransfer(to, amount1);
    ```

    **Note** the `safeTransfer` function and which is provided by `SafeERC20` [library](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#SafeERC20): `using SafeERC20 for IERC20`. In fact, the ERC-20 standard requires that `transfer` and `transferFrom` return a boolean indicating the success or failure of a call. However, some tokens don't follow the standard and have no return value. The `SafeERC20` is a wrapper that throws on failure (if a call returns false).

7. Update the stored reserves `_update(balance0, balance1, _reserve0, _reserve1)` and the cumulative prices (see later).
8. Update `klast` if fees are activated. The logic behind fee implementation can be found in [white paper page 4](https://uniswap.org/whitepaper.pdf).

##### swap

Swap `token0` for `token1`or vice-versa.

1. Calls `getReserves` to fetch stored reserves.

**Note** the block scoping to avoid [stack too deep errors](https://soliditydeveloper.com/stacktoodeep).

```Solidity
uint balance0;
uint balance1;
{
    ....
}
```

2. Optimistic transfers. We transfer tokens before checking if conditions are met. This is necessary for flash swaps.

    ```Solidity
    if (amount0Out > 0) IERC20(_token0).safeTransfer(to, amount0Out);
    if (amount1Out > 0) IERC20(_token1).safeTransfer(to, amount1Out);
    ```

3. Flash swap logic (will be discussed later)

    ```Solidity
    if (data.length > 0)
        IUniswapV2Callee(to).uniswapV2Call(
        msg.sender,
        amount0Out,
        amount1Out,
        data
    );
    ```

4. Calculate the current balance and how many tokens were sent to the core contract

    ```Solidity
    balance0 = IERC20(_token0).balanceOf(address(this));
    balance1 = IERC20(_token1).balanceOf(address(this));
    }
    uint256 amount0In = balance0 > (_reserve0 - amount0Out)? balance0 - (_reserve0 - amount0Out): 0;
    uint256 amount1In = balance1 > (_reserve1 - amount1Out)? balance1 - (_reserve1 - amount1Out): 0;
    ```

5. We need to check that the new state respects the invariant `k` (remember constant product formula. At any time y*x=k. Therefore, NewBalance0 * NewBalance1 = Reserve0 \* REserve1=k). However, we need to take into account _0,3%_ fees:

    ```Solidity
    uint256 balance0Adjusted = (balance0 * 1000) - (amount0In * 3);
    uint256 balance1Adjusted = (balance1 * 1000) - (amount1In * 3);

    if (balance0Adjusted * balance1Adjusted <uint256(_reserve0) * uint256(_reserve1) * (1000**2))
        revert InvalidK();
    ```

    **Note** the trick: Since integer division is not supported (we cannot directly compute amount0In \* 3/1000). We multiply both `balance0` and `balance1` by 1000. then during invariant check, we multiply `uint256(_reserve0) * uint256(_reserve1)` by `1000**2`.

6. Update the stored reserves `_update(balance0, balance1, _reserve0, _reserve1)` and the cumulative prices (see later).

##### \_update

This function is called every time tokens are deposited or withdrawn. It updates the stored reserves and the cumulative prices. Read more about TWAP (Time-weighted average prices) here:

-   [Uniswap v2 docs](https://docs.uniswap.org/protocol/V2/concepts/core-concepts/oracles)

Note the `unchecked` keyword, which avoids Solidity checking of overflows and underflows (cf. [here](https://docs.soliditylang.org/en/v0.8.11/control-structures.html#checked-or-unchecked-arithmetic)). In fact, this is necessary to ensure the core contract is functioning at any time. As the [whitepaper p4](https://uniswap.org/whitepaper.pdf) states:

_the date when the Unix timestamp overflows a uint32
is 02/07/2106. To ensure that this system continues to function properly after this date,
and every multiple of 232 − 1 seconds thereafter, oracles are simply required to check prices
at least once per interval (approximately 136 years). This is because the core method of
accumulation (and modding of timestamp), is actually overflow-safe, meaning that trades
across overflow intervals can be appropriately accounted for given that oracles are using the
proper (simple) overflow arithmetic to compute deltas_

##### extra functions

###### Syn or Skim

Recovery mechanism. See [whitepaper p7](https://uniswap.org/whitepaper.pdf).
