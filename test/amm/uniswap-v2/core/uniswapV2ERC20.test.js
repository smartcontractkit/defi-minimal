const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { expect } = require("chai")
const { ethers } = require("hardhat")
const { ecsign } = require("@ethereumjs/util")
const { toWei, bigNumberify } = require("../../../../utils/shared")
const { getApprovalDigest } = require("../utils/shared")
const { defaultAbiCoder, keccak256, toUtf8Bytes, hexlify } = ethers.utils
const { MaxUint256 } = ethers.constants

const TOTAL_SUPPLY = toWei(10000)
const TEST_AMOUNT = toWei(10)

describe("UniswapV2ERC20", () => {
    const deployTokenFixture = async () => {
        ;[owner, other] = await ethers.getSigners()
        const MockUniswapV2ERC20 = await ethers.getContractFactory("MockUniswapV2ERC20")
        token = await MockUniswapV2ERC20.deploy(TOTAL_SUPPLY)
        const chainId = ethers.provider.network.chainId
        return { token, chainId, owner, other }
    }

    it("name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH", async () => {
        const { token, owner, chainId } = await loadFixture(deployTokenFixture)
        const name = await token.name()
        expect(name).to.eq("Uniswap V2")
        expect(await token.symbol()).to.eq("UNI-V2")
        expect(await token.decimals()).to.eq(18)
        expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY)
        expect(await token.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY)

        expect(await token.DOMAIN_SEPARATOR()).to.eq(
            keccak256(
                defaultAbiCoder.encode(
                    ["bytes32", "bytes32", "bytes32", "uint256", "address"],
                    [
                        keccak256(
                            toUtf8Bytes(
                                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                            )
                        ),
                        keccak256(toUtf8Bytes(name)),
                        keccak256(toUtf8Bytes("1")),
                        chainId,
                        token.address,
                    ]
                )
            )
        )
        expect(await token.PERMIT_TYPEHASH()).to.eq(
            keccak256(
                toUtf8Bytes(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                )
            )
        )
    })

    it("approve", async () => {
        const { token, owner, other } = await loadFixture(deployTokenFixture)
        await expect(token.approve(other.address, TEST_AMOUNT))
            .to.emit(token, "Approval")
            .withArgs(owner.address, other.address, TEST_AMOUNT)
        expect(await token.allowance(owner.address, other.address)).to.eq(TEST_AMOUNT)
    })

    it("transfer", async () => {
        const { token, owner, other } = await loadFixture(deployTokenFixture)
        await expect(token.transfer(other.address, TEST_AMOUNT))
            .to.emit(token, "Transfer")
            .withArgs(owner.address, other.address, TEST_AMOUNT)
        expect(await token.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
        expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
    })

    it("transfer:fail", async () => {
        const { token, owner, other } = await loadFixture(deployTokenFixture)
        await expect(token.transfer(other.address, TOTAL_SUPPLY.add(1))).to.be.reverted
        await expect(token.connect(other).transfer(owner.address, 1)).to.be.reverted
    })

    it("transferFrom", async () => {
        const { token, owner, other } = await loadFixture(deployTokenFixture)
        await token.approve(other.address, TEST_AMOUNT)
        expect(await token.allowance(owner.address, other.address)).to.eq(TEST_AMOUNT)
        await expect(token.connect(other).transferFrom(owner.address, other.address, TEST_AMOUNT))
            .to.emit(token, "Transfer")
            .withArgs(owner.address, other.address, TEST_AMOUNT)
        expect(await token.allowance(owner.address, other.address)).to.eq(0)
        expect(await token.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
        expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
    })

    it("transferFrom:max", async () => {
        const { token, owner, other } = await loadFixture(deployTokenFixture)
        // allowance not updated in case of infinite allowance
        await token.approve(other.address, MaxUint256)
        await expect(token.connect(other).transferFrom(owner.address, other.address, TEST_AMOUNT))
            .to.emit(token, "Transfer")
            .withArgs(owner.address, other.address, TEST_AMOUNT)
        expect(await token.allowance(owner.address, other.address)).to.eq(MaxUint256)
        expect(await token.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
        expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
    })

    it("permit", async () => {
        const { token, chainId, owner, other } = await loadFixture(deployTokenFixture)
        const nonce = await token.nonces(owner.address)
        const deadline = MaxUint256
        const digest = await getApprovalDigest(
            token,
            { owner: owner.address, spender: other.address, value: TEST_AMOUNT },
            nonce,
            deadline,
            chainId
        )

        // account0 in hardhat
        // Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
        //Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
        const { v, r, s } = ecsign(
            Buffer.from(digest.slice(2), "hex"),
            Buffer.from(
                "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80".slice(2),
                "hex"
            )
        )

        await expect(
            token.permit(
                owner.address,
                other.address,
                TEST_AMOUNT,
                deadline,
                v,
                hexlify(r),
                hexlify(s)
            )
        )
            .to.emit(token, "Approval")
            .withArgs(owner.address, other.address, TEST_AMOUNT)
        expect(await token.allowance(owner.address, other.address)).to.eq(TEST_AMOUNT)
        expect(await token.nonces(owner.address)).to.eq(bigNumberify(1))
    })
})
