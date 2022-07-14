const { network } = require("hardhat")
const { ethers } = require("hardhat")

const DAI_INITIAL_PRICE = ethers.utils.parseEther("0.001") // 1 DAI = $1 & ETH = $1,000
const BTC_INITIAL_PRICE = ethers.utils.parseEther("2") // 1 WBTC = $2,000 & ETH = $1,000
const DECIMALS = 18
const USD_DECIMALS = 18

// We use 8 decimals for USD based currencies
const ETH_USD_INITIAL_PRICE = ethers.utils.parseUnits("1000", 8) // 1 ETH = $1,000
const BTC_USD_INITIAL_PRICE = ethers.utils.parseUnits("2000", 8) // 1 BTC = $2,000
const DAI_USD_INITIAL_PRICE = ethers.utils.parseUnits("1", 8) // 1 DAI = $1

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    // If we are on a local development network, we need to deploy mocks!
    if (chainId == 31337) {
        log("Local network detected! Deploying mocks...")
        await deploy("DAIETHPriceFeed", {
            contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [DECIMALS, DAI_INITIAL_PRICE],
        })
        await deploy("WBTCETHPriceFeed", {
            contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [DECIMALS, BTC_INITIAL_PRICE],
        })
        await deploy("DAI", {
            contract: "MockERC20",
            from: deployer,
            log: true,
            args: ["DAI", "DAI"],
        })
        await deploy("WBTC", {
            contract: "MockERC20",
            from: deployer,
            log: true,
            args: ["Wrapped Bitcoin", "WBTC"],
        })
        await deploy("WETH", {
            contract: "MockERC20",
            from: deployer,
            log: true,
            args: ["Wrapped Ethereum", "WETH"],
        })
        await deploy("RandomToken", {
            contract: "MockERC20",
            from: deployer,
            log: true,
            args: ["Random Token", "RT"],
        })

        // For stablecoins
        await deploy("ETHUSDPriceFeed", {
            contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [USD_DECIMALS, ETH_USD_INITIAL_PRICE],
        })
        await deploy("BTCUSDPriceFeed", {
            contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [USD_DECIMALS, BTC_USD_INITIAL_PRICE],
        })
        await deploy("DAIUSDPriceFeed", {
            contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [USD_DECIMALS, DAI_USD_INITIAL_PRICE],
        })
        log("Mocks Deployed!")
        log("----------------------------------------------------")
        log("You are deploying to a local network, you'll need a local network running to interact")
        log("Please run `yarn hardhat console` to interact with the deployed smart contracts!")
        log("----------------------------------------------------")
    }
}
module.exports.tags = ["all", "mocks"]
