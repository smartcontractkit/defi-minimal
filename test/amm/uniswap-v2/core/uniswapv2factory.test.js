const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { expect } = require("chai")
const { AddressZero, bigNumberify } = require("../../../../utils/shared")
const { getCreate2Address } = require("../utils/shared")
// const UniswapV2Pair = require("../../../../artifacts/contracts/amm/uniswap-v2/core/UniswapV2Pair.sol/UniswapV2Pair.json")

const TEST_ADDRESSES = [
    "0x1000000000000000000000000000000000000000",
    "0x2000000000000000000000000000000000000000",
]

describe("UniswapV2Factory", () => {
    const deployFactoryFixture = async () => {
        ;[owner, other] = await ethers.getSigners()
        const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory")
        const UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair")
        const factory = await UniswapV2Factory.deploy(owner.address)
        return { factory, UniswapV2Pair, owner, other }
    }

    const createPair = async (tokens) => {
        const { factory, UniswapV2Pair } = await loadFixture(deployFactoryFixture)
        const bytecode = UniswapV2Pair.bytecode
        const create2Address = getCreate2Address(factory.address, tokens, bytecode)
        await expect(factory.createPair(...tokens))
            .to.emit(factory, "PairCreated")
            .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, bigNumberify(1))

        await expect(factory.createPair(...tokens)).to.be.revertedWithCustomError(
            factory,
            "PairExists"
        ) // UniswapV2: PAIR_EXISTS
        await expect(factory.createPair(...tokens.slice().reverse())).to.be.revertedWithCustomError(
            factory,
            "PairExists"
        ) // UniswapV2: PAIR_EXISTS
        expect(await factory.getPair(...tokens)).to.eq(create2Address)
        expect(await factory.getPair(...tokens.slice().reverse())).to.eq(create2Address)
        expect(await factory.allPairs(0)).to.eq(create2Address)
        expect(await factory.allPairsLength()).to.eq(1)

        const pair = UniswapV2Pair.attach(create2Address)
        expect(await pair.factory()).to.eq(factory.address)
        expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
        expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
    }

    it("feeTo, feeToSetter, allPairsLength", async () => {
        const { factory, owner } = await loadFixture(deployFactoryFixture)
        expect(await factory.feeTo()).to.eq(AddressZero)
        expect(await factory.feeToSetter()).to.eq(owner.address)
        expect(await factory.allPairsLength()).to.eq(0)
    })

    it("createPair", async () => {
        await createPair(TEST_ADDRESSES)
    })

    it("createPair:reverse", async () => {
        await createPair(TEST_ADDRESSES.slice().reverse())
    })

    it("setFeeTo", async () => {
        const { factory } = await loadFixture(deployFactoryFixture)
        await expect(factory.connect(other).setFeeTo(other.address))
            .to.be.revertedWithCustomError(factory, "Forbidden")
            .withArgs(other.address, owner.address)
        await factory.setFeeTo(other.address)
        expect(await factory.feeTo()).to.eq(other.address)
    })

    it("setFeeToSetter", async () => {
        const { factory } = await loadFixture(deployFactoryFixture)
        await expect(factory.connect(other).setFeeToSetter(other.address))
            .to.be.revertedWithCustomError(factory, "Forbidden")
            .withArgs(other.address, owner.address)
        await factory.setFeeToSetter(other.address)
        expect(await factory.feeToSetter()).to.eq(other.address)
        await expect(factory.setFeeToSetter(owner.address))
            .to.be.revertedWithCustomError(factory, "Forbidden")
            .withArgs(owner.address, other.address)
    })
})
