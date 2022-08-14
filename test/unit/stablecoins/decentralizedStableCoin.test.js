const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Decentralized Stablecoin tests", function () {
          let decentralizedStableCoin,
              deployer,
              accounts,
              liquidator,
              dscEngine,
              weth,
              ethUsdPriceFeed
          beforeEach(async () => {
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              liquidator = accounts[1]
              await deployments.fixture(["mocks", "decentralizedstablecoin"])
              decentralizedStableCoin = await ethers.getContract("DecentralizedStableCoin")
              dscEngine = await ethers.getContract("DSCEngine")
              weth = await ethers.getContract("WETH")
              ethUsdPriceFeed = await ethers.getContract("ETHUSDPriceFeed")
          })

          it("can be minted with deposited collateral", async function () {
              const amountCollateral = ethers.utils.parseEther("10") // Price Starts off at $1,000
              const amountToMint = ethers.utils.parseEther("100") // $100 minted with $10,000 collateral
              await weth.approve(dscEngine.address, amountCollateral)

              await dscEngine.depositCollateralAndMintDsc(
                  weth.address,
                  amountCollateral,
                  amountToMint
              )

              const balance = await decentralizedStableCoin.balanceOf(deployer.address)

              assert.equal(balance.toString(), amountToMint.toString())
          })

          it("can redeem deposited collateral", async function () {
              const amountCollateral = ethers.utils.parseEther("10") // Price Starts off at $1,000
              const amountToMint = ethers.utils.parseEther("100") // $100 minted with $10,000 collateral
              await weth.approve(dscEngine.address, amountCollateral)

              await dscEngine.depositCollateralAndMintDsc(
                  weth.address,
                  amountCollateral,
                  amountToMint
              )
              await decentralizedStableCoin.approve(dscEngine.address, amountToMint)
              await dscEngine.redeemCollateralForDsc(weth.address, amountCollateral, amountToMint)

              assert(await decentralizedStableCoin.balanceOf(dscEngine.address), "0")
          })

          it("properly reports health factor", async function () {
              const amountCollateral = ethers.utils.parseEther("10") // Price Starts off at $1,000
              const amountToMint = ethers.utils.parseEther("100") // $100 minted with $10,000 collateral
              await weth.approve(dscEngine.address, amountCollateral)

              await dscEngine.depositCollateralAndMintDsc(
                  weth.address,
                  amountCollateral,
                  amountToMint
              )

              const healthFactor = await dscEngine.healthFactor(deployer.address)
              // $100 minted with $10,000 collateral at a 50% liquidation threshold means that
              // We must have $200 collateral at all times
              // Which means, 10,000 / 200 = 50 health factor
              assert.equal(ethers.utils.formatEther(healthFactor.toString()), "50.0")
          })

          it("can be liquidated if pricing changes", async function () {
              const amountCollateral = ethers.utils.parseEther("10") // Price Starts off at $1,000
              const amountToMint = ethers.utils.parseEther("100") // $100 minted with $10,000 collateral
              await weth.approve(dscEngine.address, amountCollateral)
              await dscEngine.depositCollateralAndMintDsc(
                  weth.address,
                  amountCollateral,
                  amountToMint
              )

              const ethUsdUpdatedPrice = ethers.utils.parseUnits("18", 8) // 1 ETH = $18, meaning we are way under 200% collateralization

              const updateTx = await ethUsdPriceFeed.updateAnswer(ethUsdUpdatedPrice)
              await updateTx.wait()

              const healthFactor = (await dscEngine.healthFactor(deployer.address)).toString()
              assert.equal(ethers.utils.formatEther(healthFactor), "0.9")
              // Uh oh! This means we can liquidate!

              // Let's give our liquidator some DSC
              const moreCollateral = ethers.utils.parseEther("1000")
              await weth.transfer(liquidator.address, moreCollateral)
              const liquidatorConnectedWeth = await weth.connect(liquidator)
              const liquidatorConnectedDsce = await dscEngine.connect(liquidator)
              const liquidatorConnectedDsc = await decentralizedStableCoin.connect(liquidator)

              await liquidatorConnectedWeth.approve(dscEngine.address, moreCollateral)
              await liquidatorConnectedDsce.depositCollateralAndMintDsc(
                  weth.address,
                  moreCollateral,
                  amountToMint
              )

              const balance = await decentralizedStableCoin.balanceOf(liquidator.address)
              assert.equal(balance.toString(), amountToMint.toString())
              await liquidatorConnectedDsc.approve(dscEngine.address, amountToMint)
              await liquidatorConnectedDsce.liquidate(weth.address, deployer.address, amountToMint)
          })
      })
