const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
const { moveBlocks } = require("../../utils/move-blocks")
const { moveTime } = require("../../utils/move-time")

const BTC_UPDATED_PRICE = ethers.utils.parseEther("1.9")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lending Unit Tests", async function () {
          let lending, dai, wbtc, depositAmount, randomToken, player, threshold, wbtcEthPriceFeed
          beforeEach(async () => {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              player = accounts[1]
              await deployments.fixture(["mocks", "lending"])
              lending = await ethers.getContract("Lending")
              wbtc = await ethers.getContract("WBTC")
              dai = await ethers.getContract("DAI")
              randomToken = await ethers.getContract("RandomToken")
              wbtcEthPriceFeed = await ethers.getContract("WBTC")
              daiEthPriceFeed = await ethers.getContract("DAI")
              depositAmount = ethers.utils.parseEther("1")
              threshold = await lending.LIQUIDATION_THRESHOLD()
              wbtcEthPriceFeed = await ethers.getContract("WBTCETHPriceFeed")
          })

          describe("getEthValue", function () {
              // const DAI_INITIAL_PRICE = ethers.utils.parseEther("0.001") // 1 DAI = $1 & ETH = $1,0000
              it("Correctly gets DAI price", async function () {
                  const oneEthOfDai = ethers.utils.parseEther("1000")
                  const ethValueOfDai = await lending.getEthValue(dai.address, oneEthOfDai)
                  assert.equal(ethValueOfDai.toString(), ethers.utils.parseEther("1").toString())
              })
              it("Correctly gets WBTC price", async function () {
                  // const BTC_INITIAL_PRICE = ethers.utils.parseEther("2") // 1 WBTC = $2,000 & ETH = $1,0000
                  const oneEthOfWbtc = ethers.utils.parseEther("0.5")
                  const ethValueOfWbtc = await lending.getEthValue(wbtc.address, oneEthOfWbtc)
                  assert.equal(ethValueOfWbtc.toString(), ethers.utils.parseEther("1").toString())
              })
          })
          describe("getTokenValueFromEth", function () {
              // const DAI_INITIAL_PRICE = ethers.utils.parseEther("0.001") // 1 DAI = $1 & ETH = $1,0000
              it("Correctly gets DAI price", async function () {
                  const oneDaiOfEth = ethers.utils.parseEther("0.001")
                  const daiValueOfEth = await lending.getTokenValueFromEth(dai.address, oneDaiOfEth)
                  assert.equal(daiValueOfEth.toString(), ethers.utils.parseEther("1").toString())
              })
              it("Correctly gets WBTC price", async function () {
                  // const BTC_INITIAL_PRICE = ethers.utils.parseEther("2") // 1 WBTC = $2,000 & ETH = $1,0000
                  const oneWbtcOfEth = ethers.utils.parseEther("2")
                  const wbtcValueOfEth = await lending.getTokenValueFromEth(
                      wbtc.address,
                      oneWbtcOfEth
                  )
                  assert.equal(wbtcValueOfEth.toString(), ethers.utils.parseEther("1").toString())
              })
          })
          describe("Deposit", function () {
              it("Deposits money", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  const accountInfo = await lending.getAccountInformation(deployer.address)
                  assert.equal(accountInfo[0].toString(), "0")
                  // WBTC is 2x the price of ETH in our scenario, so we should see that value reflected
                  assert.equal(accountInfo[1].toString(), depositAmount.mul(2).toString())
                  const healthFactor = await lending.healthFactor(deployer.address)
                  assert.equal(healthFactor.toString(), ethers.utils.parseEther("100").toString())
              })
              it("Doesn't allow unallowed tokens", async function () {
                  await randomToken.approve(lending.address, depositAmount)
                  await expect(
                      lending.deposit(randomToken.address, depositAmount)
                  ).to.be.revertedWith("TokenNotAllowed")
              })
          })
          describe("Withdraw", function () {
              it("Pulls money", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  await lending.withdraw(wbtc.address, depositAmount)
                  const accountInfo = await lending.getAccountInformation(deployer.address)
                  assert.equal(accountInfo[0].toString(), "0")
                  assert.equal(accountInfo[1].toString(), "0")
              })
              it("only pulls funds if the user has them", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  await expect(
                      lending.withdraw(wbtc.address, depositAmount.mul(2))
                  ).to.be.revertedWith("Not enough funds")
              })
          })
          describe("Borrow", function () {
              it("Cant pull money that would make the platform involvent", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  // Setup the contract to have enough DAI to borrow
                  // Our daiBorrowAmount is set to 80% of 2000 + 1, since the threshold is 80%
                  // And this should be enought to not let us borrow this amount
                  const daiBorrowAmount = ethers.utils.parseEther(
                      (2000 * (threshold.toNumber() / 100) + 1).toString()
                  )
                  const daiEthValue = await lending.getEthValue(dai.address, daiBorrowAmount)
                  const wbtcEthValue = await lending.getEthValue(wbtc.address, depositAmount)
                  console.log(
                      `Going to attempt to borrow ${ethers.utils.formatEther(
                          daiEthValue
                      )} ETH worth of DAI (${ethers.utils.formatEther(daiBorrowAmount)} DAI)\n`
                  )
                  console.log(
                      `With only ${ethers.utils.formatEther(
                          wbtcEthValue
                      )} ETH of WBTC (${ethers.utils.formatEther(
                          depositAmount
                      )} WBTC) deposited. \n`
                  )
                  await dai.transfer(player.address, daiBorrowAmount)
                  const playerConnectedLending = await lending.connect(player)
                  const playerConnectedDai = await dai.connect(player)
                  await playerConnectedDai.approve(lending.address, daiBorrowAmount)
                  await playerConnectedLending.deposit(dai.address, daiBorrowAmount)
                  // Just to be safe let's connect back
                  await dai.connect(deployer)
                  await lending.connect(deployer)
                  const playerAccount = await lending.getAccountInformation(player.address)
                  const deployerAccount = await lending.getAccountInformation(deployer.address)
                  assert.equal(playerAccount[0].toString(), "0")
                  assert.equal(playerAccount[1].toString(), daiEthValue)
                  assert.equal(deployerAccount[0].toString(), "0")
                  assert.equal(deployerAccount[1].toString(), wbtcEthValue)
                  // Then, let's try to borrow
                  await expect(lending.borrow(dai.address, daiBorrowAmount)).to.be.revertedWith(
                      "Platform will go insolvent!"
                  )
              })
              it("Exactly the threshold can be borrowed", async function () {
                  // This is the same test as above with one difference
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  // The difference is here!
                  const daiBorrowAmount = ethers.utils.parseEther(
                      (2000 * (threshold.toNumber() / 100)).toString()
                  )
                  const daiEthValue = await lending.getEthValue(dai.address, daiBorrowAmount)
                  const wbtcEthValue = await lending.getEthValue(wbtc.address, depositAmount)
                  await dai.transfer(player.address, daiBorrowAmount)
                  const playerConnectedLending = await lending.connect(player)
                  const playerConnectedDai = await dai.connect(player)
                  await playerConnectedDai.approve(lending.address, daiBorrowAmount)
                  await playerConnectedLending.deposit(dai.address, daiBorrowAmount)
                  // Just to be safe let's connect back
                  await dai.connect(deployer)
                  await lending.connect(deployer)
                  const playerAccount = await lending.getAccountInformation(player.address)
                  let deployerAccount = await lending.getAccountInformation(deployer.address)
                  assert.equal(playerAccount[0].toString(), "0")
                  assert.equal(playerAccount[1].toString(), daiEthValue)
                  assert.equal(deployerAccount[0].toString(), "0")
                  assert.equal(deployerAccount[1].toString(), wbtcEthValue)
                  // Then, let's try to borrow
                  await lending.borrow(dai.address, daiBorrowAmount)
                  const healthFactor = await lending.healthFactor(deployer.address)
                  deployerAccount = await lending.getAccountInformation(deployer.address)
                  assert.equal(deployerAccount[0].toString(), daiEthValue)
                  assert.equal(deployerAccount[1].toString(), wbtcEthValue)
                  assert.equal(healthFactor.toString(), ethers.utils.parseEther("1").toString())
              })
          })
          describe("Repay", function () {
              it("Drops the debt when doing a repayment", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  const wbtcEthValue = await lending.getEthValue(wbtc.address, depositAmount)

                  // Let player deposit DAI
                  const daiBorrowAmount = ethers.utils.parseEther(
                      (2000 * (threshold.toNumber() / 100)).toString()
                  )
                  await dai.transfer(player.address, daiBorrowAmount)
                  const playerConnectedLending = await lending.connect(player)
                  const playerConnectedDai = await dai.connect(player)
                  await playerConnectedDai.approve(lending.address, daiBorrowAmount)
                  await playerConnectedLending.deposit(dai.address, daiBorrowAmount)
                  // Just to be safe let's connect back
                  await dai.connect(deployer)
                  await lending.connect(deployer)

                  await lending.borrow(dai.address, daiBorrowAmount)
                  await dai.approve(lending.address, daiBorrowAmount)
                  await lending.repay(dai.address, daiBorrowAmount)
                  const accountInfo = await lending.getAccountInformation(deployer.address)
                  assert.equal(accountInfo[0].toString(), "0")
                  assert.equal(accountInfo[1].toString(), wbtcEthValue)
              })
          })
          describe("Liquidate", function () {
              it("Can liquidate", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  // Let player deposit DAI
                  const daiBorrowAmount = ethers.utils.parseEther(
                      (2000 * (threshold.toNumber() / 100)).toString()
                  )
                  const daiEthValue = await lending.getEthValue(dai.address, daiBorrowAmount)

                  await dai.transfer(player.address, daiBorrowAmount)
                  await dai.transfer(player.address, daiBorrowAmount) // We send extra to repay later
                  const playerConnectedLending = await lending.connect(player)
                  const playerConnectedDai = await dai.connect(player)
                  await playerConnectedDai.approve(lending.address, daiBorrowAmount)
                  await playerConnectedLending.deposit(dai.address, daiBorrowAmount)
                  // Just to be safe let's connect back
                  await dai.connect(deployer)
                  await lending.connect(deployer)
                  await lending.borrow(dai.address, daiBorrowAmount)
                  // We drop the value of our WBTC collateral to below the threshold
                  await wbtcEthPriceFeed.updateAnswer(BTC_UPDATED_PRICE)
                  const updatedWbtcEthValue = await lending.getEthValue(wbtc.address, depositAmount)
                  console.log(
                      `The value of deposits is now ${ethers.utils.formatEther(
                          updatedWbtcEthValue
                      )}`
                  )
                  console.log(
                      `However, we have  ${ethers.utils.formatEther(daiEthValue)} DAI borrowed!`
                  )
                  let healthFactor = await lending.healthFactor(deployer.address)
                  console.log(
                      `Health factor is: ${ethers.utils.formatEther(healthFactor.toString())}`
                  )
                  // So the player should:
                  // 1. Repay 50% of the loan
                  // 2. Get 50% of the collateral + Liquidation reward % (5%)

                  // Starting Collateral: 2 ETH
                  // Starting Debt: 1.6 ETH (80% of Collateral - at the Threshold)

                  // After the price update
                  // Starting Collateral: 1.9 ETH which is 84% instead of 80%
                  // So we repay 50% of the loan (0.8 ETH of DAI)
                  // And can claim that amount of collateral from the user (0.8 ETH of DAI) + Liquidation reward (5% or 0.04 ETH of DAI)

                  // Ending collateral should be: 1.9 ETH - 0.8 ETH (taken) - 0.04 ETH (liquidation reward) = 1.06 ETH of WBTC
                  // Ending Debt should be: 1.6 ETH - 0.8 ETH (repayed) = 0.8 ETH of WBTC
                  // Which is a new ratio of ~0.75 (below the 0.8 threshold)
                  // AKA a health factor of 1.06
                  await playerConnectedDai.approve(lending.address, daiBorrowAmount)
                  await playerConnectedLending.liquidate(
                      deployer.address,
                      dai.address,
                      wbtc.address
                  )
                  const endingDebt = await lending.getAccountBorrowedValue(deployer.address)
                  const endingCollateral = await lending.getAccountCollateralValue(deployer.address)
                  const endingHealthFactor = await lending.healthFactor(deployer.address)
                  assert.equal(ethers.utils.formatEther(endingDebt.toString()), "0.8")
                  assert.equal(ethers.utils.formatEther(endingHealthFactor.toString()), "1.06")
                  console.log(
                      `Ending Debt: ${ethers.utils.formatEther(
                          endingDebt.toString()
                      )} ETH \nEnding Collateral: ${ethers.utils.formatEther(
                          endingCollateral.toString()
                      )}ETH \nEnding HealthFactor: ${ethers.utils.formatEther(
                          endingHealthFactor.toString()
                      )}`
                  )
              })
              it("Cant liquidate when health factor is ok and when reward or repay token is bad", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  // Let player deposit DAI
                  const daiBorrowAmount = ethers.utils.parseEther(
                      (2000 * (threshold.toNumber() / 100)).toString()
                  )
                  const daiEthValue = await lending.getEthValue(dai.address, daiBorrowAmount)

                  await dai.transfer(player.address, daiBorrowAmount)
                  await dai.transfer(player.address, daiBorrowAmount) // We send extra to repay later
                  const playerConnectedLending = await lending.connect(player)
                  const playerConnectedDai = await dai.connect(player)
                  const playerConnectedWbtc = await wbtc.connect(player)
                  await playerConnectedDai.approve(lending.address, daiBorrowAmount)
                  await playerConnectedLending.deposit(dai.address, daiBorrowAmount)
                  // Just to be safe let's connect back
                  await dai.connect(deployer)
                  await lending.connect(deployer)
                  await lending.borrow(dai.address, daiBorrowAmount)

                  await playerConnectedDai.approve(lending.address, daiBorrowAmount)
                  await expect(
                      playerConnectedLending.liquidate(deployer.address, dai.address, wbtc.address)
                  ).to.be.revertedWith("Account can't be liquidated!")
                  await wbtcEthPriceFeed.updateAnswer(BTC_UPDATED_PRICE)
                  await expect(
                      playerConnectedLending.liquidate(deployer.address, dai.address, dai.address)
                  ).to.be.revertedWith("Not enough funds to withdraw")

                  await playerConnectedWbtc.approve(lending.address, depositAmount)
                  await expect(
                      playerConnectedLending.liquidate(deployer.address, wbtc.address, wbtc.address)
                  ).to.be.revertedWith("Choose a different repayToken!")
              })
          })
      })
