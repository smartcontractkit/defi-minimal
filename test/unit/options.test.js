const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")


describe("Options contract unit tests", async() => {
    beforeEach(async () => {
        let dai = address(0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa);
        [owner, addr1, addr2] = await ethers.getSigners();

        Options = await ethers.getContractFactory("Options");
        options = await Options.deploy(dai)
        options = await options.deployed()
        daiEthPriceFeed = await ethers.getContract("DAIETHPriceFeed")
    });

})