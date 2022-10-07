const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Centralized Stablecoin tests", function () {
          let centralizedStablecoin, deployer, accounts
          beforeEach(async () => {
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              await deployments.fixture(["centralizedstablecoin"])
              centralizedStablecoin = await ethers.getContract("CentralizedStableCoin")
          })

          it("Can blacklist", async function () {
              const transferAmount = ethers.utils.parseUnits("1", "ether")
              const blackListedAccount = accounts[1]
              const blacklistTx = await centralizedStablecoin.blacklist(blackListedAccount.address)
              await blacklistTx.wait(1)
              await expect(
                  centralizedStablecoin.transfer(blackListedAccount.address, transferAmount)
              ).to.be.revertedWith("CentralizedStableCoin__AddressBlacklisted()")
          })

          // incomplete
          //   it("Can mint", async function () {})
          //   it("Can burn", async function () {})
          //   it("only owner can assign minters and blacklist", async function () {})
      })
