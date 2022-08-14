const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Centralized Stablecoin tests", function () {
          let centralizedStableCoin, deployer, accounts, badActor
          beforeEach(async () => {
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              badActor = accounts[1]
              await deployments.fixture(["centralizedstablecoin"])
              centralizedStableCoin = await ethers.getContract("CentralizedStableCoin")
          })

          it("Can blacklist", async function () {
              const transferAmount = ethers.utils.parseUnits("1", "ether")
              const blackListedAccount = accounts[1]
              const blacklistTx = await centralizedStableCoin.blacklist(blackListedAccount.address)
              await blacklistTx.wait(1)
              await expect(
                  centralizedStableCoin.transfer(blackListedAccount.address, transferAmount)
              ).to.be.revertedWith("CentralizedStableCoin__AddressBlacklisted()")
          })

          it("allows minters to mint", async function () {
              const startingMinterBalance = await centralizedStableCoin.balanceOf(deployer.address)

              const mintAmount = ethers.utils.parseUnits("100", "ether")
              const configureMintTx = await centralizedStableCoin.configureMinter(
                  deployer.address,
                  mintAmount
              )
              await configureMintTx.wait(1)

              const mintTx = await centralizedStableCoin.mint(deployer.address, mintAmount)
              await mintTx.wait(1)

              const endingMinterBalance = await centralizedStableCoin.balanceOf(deployer.address)
              assert(
                  endingMinterBalance.sub(startingMinterBalance).toString() == mintAmount.toString()
              )
          })
          it("doesn't allow non-minters to mint", async function () {
              const mintAmount = ethers.utils.parseUnits("100", "ether")
              await centralizedStableCoin.connect(badActor)
              await expect(
                  centralizedStableCoin.mint(deployer.address, mintAmount)
              ).to.be.revertedWith("CentralizedStableCoin__NotMinter()")
          })
          it("Can burn", async function () {
              // Arrange
              const startingBalance = await centralizedStableCoin.balanceOf(deployer.address)
              const burnAmount = ethers.utils.parseUnits("1", "ether")
              const configureBurnTx = await centralizedStableCoin.configureMinter(
                  deployer.address,
                  burnAmount
              )
              await configureBurnTx.wait(1)

              // Act
              const burnTx = await centralizedStableCoin.burn(burnAmount)
              await burnTx.wait(1)

              // Assert
              const endingBalance = await centralizedStableCoin.balanceOf(deployer.address)
              assert(startingBalance.sub(burnAmount).toString() == endingBalance.toString())
          })
          // More tests below...
      })
