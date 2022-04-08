const { expect } = require("chai")

describe("Token", () => {
    let owner
    let token

    const tokenName = "Token",
        tokenSymbol = "TKN",
        initialTokenSupply = 10000

    before(async () => {
        ;[owner] = await ethers.getSigners()

        const Token = await ethers.getContractFactory("Token")
        token = await Token.deploy(tokenName, tokenSymbol, initialTokenSupply)
        await token.deployed()
    })

    it("sets name and symbol when created", async () => {
        expect(await token.name()).to.equal(tokenName)
        expect(await token.symbol()).to.equal(tokenSymbol)
    })

    it("mints initialSupply to msg.sender when created", async () => {
        expect(await token.totalSupply()).to.equal(initialTokenSupply)
        expect(await token.balanceOf(owner.address)).to.equal(initialTokenSupply)
    })
})
