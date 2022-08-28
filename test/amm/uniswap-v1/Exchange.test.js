const { expect } = require("chai")

const toWei = (value) => ethers.utils.parseEther(value.toString())

const fromWei = (value) =>
    ethers.utils.formatEther(typeof value === "string" ? value : value.toString())

const getBalance = ethers.provider.getBalance

const getAmount = (inputAmount, inputReserve, outputReserve) => {
    const inputAmountLessFees = inputAmount.mul(997).div(1000)
    return inputAmountLessFees.mul(outputReserve).div(inputReserve.add(inputAmountLessFees))
}

const createExchange = async (factory, tokenAddress) => {
    const exchangeAddress = await factory.callStatic.createExchange(tokenAddress)

    await factory.createExchange(tokenAddress)

    const Exchange = await ethers.getContractFactory("Exchange")

    return await Exchange.attach(exchangeAddress)
}

describe("Exchange", () => {
    let owner, user, liquidityProvider
    let exchange
    const poolTokenName = "Funkyswap V1",
        poolTokenSymbol = "FUNKY-V1",
        initialPoolTokenSupply = toWei(0)
    const tokenName = "Token",
        tokenSymbol = "TKN",
        initialTokenSupply = toWei(1000000)

    const initialReserve = toWei(0)

    beforeEach(async () => {
        ;[owner, user, liquidityProvider] = await ethers.getSigners()

        const Token = await ethers.getContractFactory("Token")
        token = await Token.deploy(tokenName, tokenSymbol, initialTokenSupply)
        await token.deployed()

        const Exchange = await ethers.getContractFactory("Exchange")
        exchange = await Exchange.deploy(token.address)
        await exchange.deployed()
    })

    it("is deployed", async () => {
        expect(await exchange.deployed()).to.equal(exchange)
        expect(await exchange.name()).to.equal(poolTokenName)
        expect(await exchange.symbol()).to.equal(poolTokenSymbol)
        expect(await exchange.totalSupply()).to.equal(initialPoolTokenSupply)
        const { tokenReserve, ethReserve } = await exchange.getReserves()
        expect(tokenReserve).to.equal(initialReserve)
        expect(ethReserve).to.equal(initialReserve)
    })

    describe("Liquidity", async () => {
        it("add liquidity", async () => {
            const ethAmount = toWei(100),
                tokenAmount = toWei(200)
            const initialPoolAmount = ethAmount
            // transfer from owner to liquidityprovider
            await token.transfer(liquidityProvider.address, tokenAmount)
            // add liquidity
            await token.connect(liquidityProvider).approve(exchange.address, tokenAmount)
            await exchange
                .connect(liquidityProvider)
                .addLiquidity(tokenAmount, { value: ethAmount })

            // check reserves updated
            const { tokenReserve, ethReserve } = await exchange.getReserves()
            expect(await getBalance(exchange.address)).to.equal(ethAmount)
            expect(tokenReserve).to.equal(tokenAmount)
            expect(ethReserve).to.equal(ethAmount)

            // check LP have been minted with the correct balance
            expect(await exchange.balanceOf(liquidityProvider.address)).to.eq(initialPoolAmount)
            expect(await exchange.totalSupply()).to.eq(initialPoolAmount)
        })

        it("remove liquidity", async () => {
            const ethAmount = toWei(100),
                tokenAmount = toWei(200)
            const liquidityToRemove = toWei(50)
            // transfer from owner to liquidityprovider
            await token.transfer(liquidityProvider.address, tokenAmount)

            // add liquidity
            await token.connect(liquidityProvider).approve(exchange.address, tokenAmount)
            await exchange
                .connect(liquidityProvider)
                .addLiquidity(tokenAmount, { value: ethAmount })
            // capture user balances
            const ethBalanceBefore = await getBalance(liquidityProvider.address)
            const tokenBalancerBefore = await token.balanceOf(liquidityProvider.address)

            // now remove
            const receipt = await (
                await exchange.connect(liquidityProvider).removeLiquidity(liquidityToRemove)
            ).wait()
            const gas = receipt.gasUsed
            const gasPrice = receipt.effectiveGasPrice
            const fees = gas.mul(gasPrice)

            // check reserves updated
            const { tokenReserve, ethReserve } = await exchange.getReserves()
            expect(await getBalance(exchange.address)).to.equal(toWei(50)) // 100 - 50 = 50
            expect(tokenReserve).to.equal(toWei(100)) // 200-(50/100)*200 = 100
            expect(ethReserve).to.equal(toWei(50)) // 100-(50/100)*100 = 50

            // capture user balances
            const ethBalanceAfter = await getBalance(liquidityProvider.address)
            const tokenBalancerAfter = await token.balanceOf(liquidityProvider.address)

            // check
            expect(fromWei(ethBalanceAfter.add(fees).sub(ethBalanceBefore))).to.equal("50.0") // (50/100)*100

            expect(fromWei(tokenBalancerAfter.sub(tokenBalancerBefore))).to.equal("100.0") // (50/100)*200
        })
    })

    describe("Pricing function", async () => {
        it("returns correct token amount", async () => {
            await token.approve(exchange.address, toWei(2000))
            await exchange.addLiquidity(toWei(2000), { value: toWei(1000) })

            const { tokenReserve, ethReserve } = await exchange.getReserves()

            let tokensOut = await exchange.getTokenAmount(toWei(1))
            expect(tokensOut).to.equal(getAmount(toWei(1), ethReserve, tokenReserve))

            tokensOut = await exchange.getTokenAmount(toWei(100))
            expect(tokensOut).to.equal(getAmount(toWei(100), ethReserve, tokenReserve))

            tokensOut = await exchange.getTokenAmount(toWei(1000))
            expect(tokensOut).to.equal(getAmount(toWei(1000), ethReserve, tokenReserve))
        })

        it("returns correct ether amount", async () => {
            await token.approve(exchange.address, toWei(2000))
            await exchange.addLiquidity(toWei(2000), { value: toWei(1000) })

            const { tokenReserve, ethReserve } = await exchange.getReserves()

            let ethOut = await exchange.getEthAmount(toWei(2))
            expect(ethOut).to.equal(getAmount(toWei(2), tokenReserve, ethReserve))

            ethOut = await exchange.getEthAmount(toWei(100))
            expect(ethOut).to.equal(getAmount(toWei(100), tokenReserve, ethReserve))

            ethOut = await exchange.getEthAmount(toWei(2000))
            expect(ethOut).to.equal(getAmount(toWei(2000), tokenReserve, ethReserve))
        })
    })

    describe("Swap", async () => {
        beforeEach(async () => {
            await token.approve(exchange.address, toWei(2000))
            await exchange.addLiquidity(toWei(2000), { value: toWei(1000) })
        })

        it("eth to token", async () => {
            const userEthBalanceBefore = await getBalance(user.address)
            const ethAmountToSwap = toWei(2)
            const expectedTokenAmount = await exchange.getTokenAmount(ethAmountToSwap)

            const { tokenReserve: tokenReserveBefore, ethReserve: ethReserveBefore } =
                await exchange.getReserves()

            const receipt = await (
                await exchange
                    .connect(user)
                    .ethToTokenSwap(expectedTokenAmount, { value: ethAmountToSwap })
            ).wait()
            const gas = receipt.gasUsed
            const gasPrice = receipt.effectiveGasPrice
            const fees = gas.mul(gasPrice)

            const userEthBalanceAfter = await getBalance(user.address)
            const userTokenBalanceAfter = await token.balanceOf(user.address)

            expect(userEthBalanceAfter.sub(userEthBalanceBefore.sub(fees))).to.equal(
                ethAmountToSwap.mul(-1)
            )
            expect(userTokenBalanceAfter).to.equal(expectedTokenAmount)

            const { tokenReserve: tokenReserveAfter, ethReserve: ethReserveAfter } =
                await exchange.getReserves()

            // check the new reserves. more ETH and less tokens
            expect(ethReserveAfter).to.equal(ethReserveBefore.add(ethAmountToSwap))
            expect(tokenReserveAfter).to.equal(tokenReserveBefore.sub(expectedTokenAmount))
        })

        it("token to eth", async () => {
            // transfer from owner to user
            await token.transfer(user.address, toWei(11))
            const tokenAmountToSwap = toWei(10)
            await token.connect(user).approve(exchange.address, tokenAmountToSwap)

            const userEthBalanceBefore = await getBalance(user.address)
            const userTokenBalanceBefore = await token.balanceOf(user.address)
            const expectedEthAmount = await exchange.getEthAmount(tokenAmountToSwap)

            const { tokenReserve: tokenReserveBefore, ethReserve: ethReserveBefore } =
                await exchange.getReserves()

            const receipt = await (
                await exchange.connect(user).tokenToEthSwap(tokenAmountToSwap, expectedEthAmount)
            ).wait()
            const gas = receipt.gasUsed
            const gasPrice = receipt.effectiveGasPrice
            const fees = gas.mul(gasPrice)

            const userEthBalanceAfter = await getBalance(user.address)
            const userTokenBalanceAfter = await token.balanceOf(user.address)
            expect(userEthBalanceAfter.sub(userEthBalanceBefore.sub(fees))).to.equal(
                expectedEthAmount
            )

            expect(userTokenBalanceAfter.sub(userTokenBalanceBefore)).to.equal(
                tokenAmountToSwap.mul(-1)
            )
            const { tokenReserve: tokenReserveAfter, ethReserve: ethReserveAfter } =
                await exchange.getReserves()

            // check the new reserves. less ETH and more tokens
            expect(ethReserveAfter).to.equal(ethReserveBefore.sub(expectedEthAmount))
            expect(tokenReserveAfter).to.equal(tokenReserveBefore.add(tokenAmountToSwap))
        })

        it("token to token", async () => {
            const Factory = await ethers.getContractFactory("Factory")
            const Token = await ethers.getContractFactory("Token")

            const factory = await Factory.deploy()
            const tokenA = await Token.deploy("TokenA", "AAA", toWei(1000000))
            const tokenB = await Token.connect(user).deploy("TokenB", "BBBB", toWei(1000000))

            await factory.deployed()
            await tokenA.deployed()
            await tokenB.deployed()

            const exchangeA = await createExchange(factory, tokenA.address)
            const exchangeB = await createExchange(factory, tokenB.address)

            await tokenA.approve(exchangeA.address, toWei(2000)) // owner adds liquidity
            await exchangeA.addLiquidity(toWei(2000), { value: toWei(1000) })

            await tokenB.connect(user).approve(exchangeB.address, toWei(1000)) // user adds liquidity
            await exchangeB.connect(user).addLiquidity(toWei(1000), { value: toWei(1000) })

            expect(await tokenB.balanceOf(owner.address)).to.equal(0)
            expect(await tokenA.balanceOf(user.address)).to.equal(0)

            let expectedEthAmount = 0,
                expectedTokenAmount = 0,
                tokenAmountToSwap = toWei(10)

            // owner will swap tokenA for tokenB
            expectedEthAmount = await exchangeA.getEthAmount(tokenAmountToSwap)
            expectedTokenAmount = await exchangeB.getTokenAmount(expectedEthAmount)
            await tokenA.approve(exchangeA.address, tokenAmountToSwap)
            await exchangeA.tokenToTokenSwap(tokenAmountToSwap, expectedTokenAmount, tokenB.address)
            expect(await tokenB.balanceOf(owner.address)).to.equal(expectedTokenAmount)

            // user will swap tokenB for tokenA
            expectedEthAmount = await exchangeB.getEthAmount(tokenAmountToSwap)
            expectedTokenAmount = await exchangeA.getTokenAmount(expectedEthAmount)
            await tokenB.connect(user).approve(exchangeB.address, tokenAmountToSwap)
            await exchangeB
                .connect(user)
                .tokenToTokenSwap(tokenAmountToSwap, expectedTokenAmount, tokenA.address)
            expect(await tokenA.balanceOf(user.address)).to.equal(expectedTokenAmount)
        })
    })
})
