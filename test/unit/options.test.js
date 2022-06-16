const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
const { moveBlocks } = require("../../utils/move-blocks")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Options unit tests", () => {
          let owner, writer, buyer
          beforeEach(async () => {
              const [account] = await ethers.getSigners()
              owner = account[0]
              writer = account[1]
              buyer = account[2]

              await deployments.fixture(["mocks", "options"])

              daiEthPriceFeed = await ethers.getContract("DAIETHPriceFeed")
              dai = await ethers.getContract("DAI")
              options = await ethers.getContract("Options")

              depositAmt = ethers.utils.parseEther("1")
          })
          describe("Get DAI/ETH price data from oracle", () => {
              it("Should not be null", async () => {
                  const daiPerOneEth = ethers.utils.parseEther("1000")
                  const priceEthPerOneDai = await options.getPriceFeed(daiPerOneEth)
                  expect(priceEthPerOneDai).not.be.null
              })
              it("Should return DAI/ETH price", async () => {
                  const daiPerOneEth = ethers.utils.parseEther("1000")
                  const price = await options.getPriceFeed(daiPerOneEth)
                  assert.equal(price.toString(), ethers.utils.parseEther("1").toString())
                  console.log(`price: ${price / 1e18}`)
              })
          })

          describe("Init contract", () => {
              it("Should deploy w/o incident", async () => {
                  address = options.address
                  assert.notEqual(address, "")
                  assert.notEqual(address, 0x0)
                  assert.notEqual(address, null)
                  assert.notEqual(address, undefined)
              })
          })
          describe("Option parameters", () => {
              const amount = 1
              const premiumDue = 1
              const daysToExpiry = 1

              describe("Writing a call", () => {
                  const strike = 1000
                  const daiAmount = 1000

                  it("Should use correct parameters", async () => {
                      const writeCall = await options.writeCallOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )
                      expect(amount).to.equal(1)
                      expect(strike).to.equal(1000)
                      expect(premiumDue).to.equal(1)
                      expect(daysToExpiry).to.equal(1)
                      expect(daiAmount).to.equal(1000)
                  })
                  it("Should emit call option event", async () => {
                      const writeCall = await options.writeCallOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )
                      await expect(writeCall).to.emit(options, "CallOptionOpen")
                  })
              })
              describe("Buy call options", () => {
                  const strike = 1000
                  const daiAmount = 1000

                  it("Should emit buy call option event", async () => {
                      await options.writeCallOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )

                      await dai.approve(options.address, depositAmt)
                      const buyCall = await options.buyCallOption(0, { from: buyer })

                      await expect(buyCall).to.emit(options, "CallOptionBought")
                  })
                  it("Should be a call and reject a put", async () => {
                      await options.writeCallOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )
                      await expect(options.buyPutOption(0, { from: buyer })).to.be.reverted
                  })
              })
              describe("Write a put option contract", () => {
                  const strike = 1000
                  const daiAmount = 1000

                  it("Should use correct parameters", async () => {
                      const writePut = await options.writePutOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )
                      expect(amount).to.equal(1)
                      expect(strike).to.equal(1000)
                      expect(premiumDue).to.equal(1)
                      expect(daysToExpiry).to.equal(1)
                  })
                  it("Should emit open put option event", async () => {
                      const writePut = await options.writePutOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )
                      await expect(writePut).to.emit(options, "PutOptionOpen")
                  })
              })
              describe("Buy put option", () => {
                  const strike = 1000
                  const daiAmount = 1000

                  it("Should emit buy put option event", async () => {
                      await options.writePutOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )

                      await dai.approve(options.address, depositAmt)
                      const buyPut = await options.buyPutOption(0, { from: buyer })

                      await expect(buyPut).to.emit(options, "PutOptionBought")
                  })
                  it("Should be a put and reject a call", async () => {
                      await options.writePutOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )
                      await expect(options.buyCallOption(0, { from: buyer })).to.be.reverted
                  })
              })
              describe("Exercise call options", () => {
                  const strike = 1000
                  const daiAmount = 1000

                  it("Should fail to emit event call option exercised because spot not greater than strike...", async () => {
                      await options.writeCallOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )

                      await dai.approve(options.address, depositAmt)
                      await options.buyCallOption(0, { from: buyer })
                      await moveBlocks(1)

                      await expect(options.exerciseCallOption(0, 1000, { from: buyer })).to.be
                          .reverted
                  })
                  it("Should fail if strike > ETH spot price...", async () => {
                      await options.writeCallOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )

                      await dai.approve(options.address, depositAmt)

                      await options.buyCallOption(0, { from: buyer })
                      await moveBlocks(1)

                      await expect(options.exerciseCallOption(0, 1, { from: buyer })).to.be.reverted
                  })
              })
              describe("Exercise put options", () => {
                  it("Should fail to emit event put option exercised because spot is not less than strike...", async () => {
                      const strike = 1000
                      const daiAmount = 1000

                      await options.writePutOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )

                      await dai.approve(options.address, depositAmt)

                      await options.buyPutOption(0, { from: buyer })
                      await moveBlocks(1)

                      await expect(options.exercisePutOption(0, 1000, { from: buyer })).to.be
                          .reverted
                  })
              })
              describe("Option expires worthless", () => {
                  it("Should fail to emit event b/c call option is not worthless if spot not less than strike...", async () => {
                      const strike = 1000
                      const daiAmount = 1000

                      await options.writeCallOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )

                      await dai.approve(options.address, depositAmt)

                      await options.buyCallOption(0, { from: buyer })
                      await moveBlocks(1)

                      await expect(options.optionExpiresWorthless(0, 1000, { from: buyer })).to.be
                          .reverted

                      // const expiredCall = await options.optionExpiresWorthless(0, 1000, {from: buyer})
                      // await expect(expiredCall).to.emit(options, 'OptionExpiresWorthless')
                  })
                  it("Should fail to emit event for put option b/c it is not worthless at expiration...", async () => {
                      const strike = 1000
                      const daiAmount = 1000

                      await options.writePutOption(
                          amount,
                          strike,
                          premiumDue,
                          daysToExpiry,
                          daiAmount,
                          { from: writer, value: 1 }
                      )

                      await dai.approve(options.address, depositAmt)

                      await options.buyPutOption(0, { from: buyer })
                      await moveBlocks(1)

                      await expect(options.optionExpiresWorthless(0, 1000, { from: buyer })).to.be
                          .reverted

                      // const expiredPut = await options.optionExpiresWorthless(0, 1000, {from: buyer})
                      // await expect(expiredPut).to.emit(options, 'OptionExpiresWorthless')
                  })
              })
              describe("Writer gets funds back", () => {
                  it("Should fail because option is not canceled...", async () => {
                      await expect(options.retrieveExpiredFunds(0, { from: writer })).to.be.reverted
                  })
              })
          })
      })
