const { loadFixture, mine } = require("@nomicfoundation/hardhat-network-helpers")
const { expect } = require("chai")
const { toWei, AddressOne, AddressZero, bigNumberify } = require("../../../../utils/shared")
const {
    MINIMUM_LIQUIDITY,
    getCreate2Address,
    sortTokens,
    encodePrice,
    getAmount,
} = require("../utils/shared")

describe("UniswapV2Pair", () => {
    const deployFixture = async () => {
        ;[owner, other] = await ethers.getSigners()
        const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory")
        const UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair")
        const ERC20 = await ethers.getContractFactory("MockERC20")
        const factory = await UniswapV2Factory.deploy(owner.address)
        let token0 = await ERC20.deploy("Token A", "TKNA")
        let token1 = await ERC20.deploy("Token B", "TKNB")
        const tokens = sortTokens(token0, token1)
        token0 = tokens[0]
        token1 = tokens[1]
        await factory.createPair(token0.address, token1.address)
        const bytecode = UniswapV2Pair.bytecode
        const create2Address = getCreate2Address(
            factory.address,
            [token0.address, token1.address],
            bytecode
        )
        const pair = UniswapV2Pair.attach(create2Address)
        return { factory, pair, token0, token1, owner, other }
    }

    const addLiquidity = async (token0Amount, token1Amount) => {
        const { pair, token0, token1, owner } = await loadFixture(deployFixture)
        await token0.transfer(pair.address, token0Amount)
        await token1.transfer(pair.address, token1Amount)
        await pair.mint(owner.address)
    }

    it("mint", async () => {
        const { pair, token0, token1, owner } = await loadFixture(deployFixture)
        const token0Amount = toWei(1)
        const token1Amount = toWei(4)
        await token0.transfer(pair.address, token0Amount)
        await token1.transfer(pair.address, token1Amount)

        const expectedLiquidity = toWei(2)

        await expect(pair.mint(owner.address))
            .to.emit(pair, "Transfer")
            .withArgs(AddressZero, AddressOne, MINIMUM_LIQUIDITY)
            .to.emit(pair, "Transfer")
            .withArgs(AddressZero, owner.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
            .to.emit(pair, "Sync")
            .withArgs(token0Amount, token1Amount)
            .to.emit(pair, "Mint")
            .withArgs(owner.address, token0Amount, token1Amount)

        expect(await pair.token0()).to.eq(token0.address)
        expect(await pair.token1()).to.eq(token1.address)
        expect(await pair.totalSupply()).to.eq(expectedLiquidity)
        expect(await pair.balanceOf(owner.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        expect(await token0.balanceOf(pair.address)).to.eq(token0Amount)
        expect(await token1.balanceOf(pair.address)).to.eq(token1Amount)
        const reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(token0Amount)
        expect(reserves[1]).to.eq(token1Amount)
    })

    // [swapAmount, token0Amount, token1Amount, expectedOutputAmount]
    // token0Amount,token1Amount used for initial liquidity
    // then swap swapAmount of Token0 for expectedOutputAmount of token1
    const swapTestCases = [
        [1, 5, 10], // 1662497915624478906
        [1, 10, 5], // 453305446940074565
        [2, 5, 10], // 2851015155847869602
        [2, 10, 5], // 831248957812239453
        [1, 10, 10], // 906610893880149131
        [1, 100, 100], // 987158034397061298
        [1, 1000, 1000], // 996006981039903216
    ].map((a) => [
        toWei(a[0]),
        toWei(a[1]),
        toWei(a[2]),
        getAmount(toWei(a[0]), toWei(a[1]), toWei(a[2])),
    ])
    swapTestCases.forEach((swapTestCase, i) => {
        it(`getInputPrice:${i}`, async () => {
            const { pair, token0, owner } = await loadFixture(deployFixture)
            const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] = swapTestCase
            await addLiquidity(token0Amount, token1Amount)
            await token0.transfer(pair.address, swapAmount)
            const reserves = await pair.getReserves()
            const expected = getAmount(swapAmount, reserves[0], reserves[1])
            // try to swap token0 for token1
            await expect(
                pair.swap(0, expectedOutputAmount.add(1), owner.address, "0x")
            ).to.be.revertedWithCustomError(pair, "InvalidK")
            await pair.swap(0, expectedOutputAmount, owner.address, "0x")
        })
    })

    // [outputAmount, token0Amount, token1Amount, inputAmount]
    // token0Amount,token1Amount used for initial liquidity
    const optimisticTestCases = [
        ["997000000000000000", 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .997)
        ["997000000000000000", 10, 5, 1],
        ["997000000000000000", 5, 5, 1],
        [1, 5, 5, "1003009027081243732"], // given amountOut, amountIn = ceiling(amountOut / .997)
    ].map((a) => a.map((n) => (typeof n === "string" ? bigNumberify(n) : toWei(n))))
    optimisticTestCases.forEach((optimisticTestCase, i) => {
        it(`optimistic:${i}`, async () => {
            const { pair, token0, owner } = await loadFixture(deployFixture)
            const [outputAmount, token0Amount, token1Amount, inputAmount] = optimisticTestCase
            await addLiquidity(token0Amount, token1Amount)
            await token0.transfer(pair.address, inputAmount)
            await expect(
                pair.swap(outputAmount.add(1), 0, owner.address, "0x")
            ).to.be.revertedWithCustomError(pair, "InvalidK")
            await pair.swap(outputAmount, 0, owner.address, "0x")
        })
    })

    it("swap:token0", async () => {
        const { pair, token0, token1, owner } = await loadFixture(deployFixture)
        const token0Amount = toWei(5)
        const token1Amount = toWei(10)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = toWei(1)
        let reserves = await pair.getReserves()
        const expectedOutputAmount = getAmount(swapAmount, reserves[0], reserves[1]) // 1662497915624478906
        await token0.transfer(pair.address, swapAmount)
        // swap swapAmount of token0 for expectedOutputAmount of token1
        await expect(pair.swap(0, expectedOutputAmount, owner.address, "0x"))
            .to.emit(token1, "Transfer")
            .withArgs(pair.address, owner.address, expectedOutputAmount)
            .to.emit(pair, "Sync")
            .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
            .to.emit(pair, "Swap")
            .withArgs(owner.address, swapAmount, 0, 0, expectedOutputAmount, owner.address)

        reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(token0Amount.add(swapAmount))
        expect(reserves[1]).to.eq(token1Amount.sub(expectedOutputAmount))
        expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.add(swapAmount))
        expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.sub(expectedOutputAmount))
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(owner.address)).to.eq(
            totalSupplyToken0.sub(token0Amount).sub(swapAmount) // owner add token0Amount for liquidity then swapAmount to swap
        )
        expect(await token1.balanceOf(owner.address)).to.eq(
            totalSupplyToken1.sub(token1Amount).add(expectedOutputAmount) // owner added token1Amount for liquidity then expectedOutputAmount to swap
        )
    })

    it("swap:token1", async () => {
        const { pair, token0, token1, owner } = await loadFixture(deployFixture)
        const token0Amount = toWei(5)
        const token1Amount = toWei(10)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = toWei(1)
        let reserves = await pair.getReserves()
        const expectedOutputAmount = getAmount(swapAmount, reserves[1], reserves[0]) // 453305446940074565
        await token1.transfer(pair.address, swapAmount)
        // swap swapAmount of token1 for expectedOutputAmount of token0
        await expect(pair.swap(expectedOutputAmount, 0, owner.address, "0x"))
            .to.emit(token0, "Transfer")
            .withArgs(pair.address, owner.address, expectedOutputAmount)
            .to.emit(pair, "Sync")
            .withArgs(token0Amount.sub(expectedOutputAmount), token1Amount.add(swapAmount))
            .to.emit(pair, "Swap")
            .withArgs(owner.address, 0, swapAmount, expectedOutputAmount, 0, owner.address)

        reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(token0Amount.sub(expectedOutputAmount))
        expect(reserves[1]).to.eq(token1Amount.add(swapAmount))
        expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.sub(expectedOutputAmount))
        expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.add(swapAmount))
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(owner.address)).to.eq(
            totalSupplyToken0.sub(token0Amount).add(expectedOutputAmount)
        )
        expect(await token1.balanceOf(owner.address)).to.eq(
            totalSupplyToken1.sub(token1Amount).sub(swapAmount)
        )
    })

    it("burn", async () => {
        const { pair, token0, token1, owner } = await loadFixture(deployFixture)
        const token0Amount = toWei(3)
        const token1Amount = toWei(3)
        await addLiquidity(token0Amount, token1Amount)

        const expectedLiquidity = toWei(3)
        // owner wants to burn his liquidity: expectedLiquidity.sub(MINIMUM_LIQUIDITY)
        await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        await expect(pair.burn(owner.address))
            .to.emit(pair, "Transfer")
            .withArgs(pair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
            .to.emit(token0, "Transfer")
            .withArgs(pair.address, owner.address, token0Amount.sub(MINIMUM_LIQUIDITY))
            .to.emit(token1, "Transfer")
            .withArgs(pair.address, owner.address, token1Amount.sub(MINIMUM_LIQUIDITY))
            .to.emit(pair, "Sync")
            .withArgs(MINIMUM_LIQUIDITY, MINIMUM_LIQUIDITY)
            .to.emit(pair, "Burn")
            .withArgs(
                owner.address,
                token0Amount.sub(MINIMUM_LIQUIDITY),
                token1Amount.sub(MINIMUM_LIQUIDITY),
                owner.address
            )

        expect(await pair.balanceOf(owner.address)).to.eq(0)
        expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
        expect(await token0.balanceOf(pair.address)).to.eq(MINIMUM_LIQUIDITY)
        expect(await token1.balanceOf(pair.address)).to.eq(MINIMUM_LIQUIDITY)
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(owner.address)).to.eq(
            totalSupplyToken0.sub(MINIMUM_LIQUIDITY)
        )
        expect(await token1.balanceOf(owner.address)).to.eq(
            totalSupplyToken1.sub(MINIMUM_LIQUIDITY)
        )
    })

    it("price{0,1}CumulativeLast", async () => {
        const { pair, token0 } = await loadFixture(deployFixture)
        const token0Amount = toWei(3)
        const token1Amount = toWei(3)
        await addLiquidity(token0Amount, token1Amount)

        const blockTimestamp = (await pair.getReserves())[2]

        await pair.sync() // +1 block

        const initialPrice = encodePrice(token0Amount, token1Amount)
        expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0])
        expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1])
        expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 1)

        const swapAmount = toWei(3)
        await token0.transfer(pair.address, swapAmount) // +1 block

        await mine(7) // +7blocks
        // swap to a new price eagerly instead of syncing
        await pair.swap(0, toWei(1), owner.address, "0x") // make the price nice, + 1block

        expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10)) // +10 blocks since the beginning
        expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10))
        expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 10)

        await mine(9) // + 9 blocks
        await pair.sync() // +1 block

        const newPrice = encodePrice(toWei(6), toWei(2)) // 10 blocks with the new price
        expect(await pair.price0CumulativeLast()).to.eq(
            initialPrice[0].mul(10).add(newPrice[0].mul(10))
        )
        expect(await pair.price1CumulativeLast()).to.eq(
            initialPrice[1].mul(10).add(newPrice[1].mul(10))
        )
        expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 20)
    })

    it("feeTo:off", async () => {
        const { pair, owner, token1 } = await loadFixture(deployFixture)
        const token0Amount = toWei(1000)
        const token1Amount = toWei(1000)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = toWei(1)
        let reserves = await pair.getReserves()
        const expectedOutputAmount = getAmount(swapAmount, reserves[1], reserves[0]) // 996006981039903216
        await token1.transfer(pair.address, swapAmount)
        await pair.swap(expectedOutputAmount, 0, owner.address, "0x")

        const expectedLiquidity = toWei(1000)
        await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        await pair.burn(owner.address)
        expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
    })

    it("feeTo:on", async () => {
        const { pair, factory, other, token0, token1 } = await loadFixture(deployFixture)
        await factory.setFeeTo(other.address)
        const token0Amount = toWei(1000)
        const token1Amount = toWei(1000)
        //add liquidity. don't use addLiquidity function since it uses deployFixture.
        await token0.transfer(pair.address, token0Amount)
        await token1.transfer(pair.address, token1Amount)
        await pair.mint(owner.address)

        const swapAmount = toWei(1)
        let reserves = await pair.getReserves()
        const expectedOutputAmount = getAmount(swapAmount, reserves[1], reserves[0]) // 996006981039903216
        await token1.transfer(pair.address, swapAmount)
        await pair.swap(expectedOutputAmount, 0, owner.address, "0x")

        const expectedLiquidity = toWei(1000)
        await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        await pair.burn(owner.address)
        expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY.add("249750499251388")) // +fees
        expect(await pair.balanceOf(other.address)).to.eq("249750499251388") // +fees

        // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
        // ...because the initial liquidity amounts were equal
        expect(await token0.balanceOf(pair.address)).to.eq(
            bigNumberify(1000).add("249501683697445")
        )
        expect(await token1.balanceOf(pair.address)).to.eq(
            bigNumberify(1000).add("250000187312969")
        )
    })
})
