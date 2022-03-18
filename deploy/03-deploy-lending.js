const { network, ethers } = require("hardhat")
const {
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
    networkConfig,
} = require("../helper-hardhat-config")
const { verify } = require("../helper-functions")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS
    log("----------------------------------------------------")
    const args = []
    const lendingDeployment = await deploy("Lending", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(lendingDeployment.address, args)
    }

    // Setup the lending contract
    const lending = await ethers.getContract("Lending")
    if (network.config.chainId == "31337") {
        const dai = await ethers.getContract("DAI")
        const wbtc = await ethers.getContract("WBTC")
        const daiEthPriceFeed = await ethers.getContract("DAIETHPriceFeed")
        const wbtcEthPriceFeed = await ethers.getContract("WBTCETHPriceFeed")
        await lending.setAllowedToken(dai.address, daiEthPriceFeed.address)
        await lending.setAllowedToken(wbtc.address, wbtcEthPriceFeed.address)
    } else {
        await lending.setAllowedToken(
            networkConfig[network.config.chainId]["dai"],
            networkConfig[network.config.chainId]["daiEthPriceFeed"]
        )
        await lending.setAllowedToken(
            networkConfig[network.config.chainId]["wbtc"],
            networkConfig[network.config.chainId]["wbtcEthPriceFeed"]
        )
    }
    log("----------------------------------------------------")
}

module.exports.tags = ["all", "lending"]
