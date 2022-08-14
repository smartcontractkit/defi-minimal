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
    const dscArgs = []
    const decentralizedStablecoinDeployment = await deploy("DecentralizedStableCoin", {
        from: deployer,
        args: dscArgs,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    let tokenAddresses, priceFeedAddresses, dsceArgs

    if (developmentChains.includes(network.name)) {
        const dai = await ethers.getContract("DAI")
        const wbtc = await ethers.getContract("WBTC")
        const weth = await ethers.getContract("WETH")
        const daiUsdPriceFeed = await ethers.getContract("DAIUSDPriceFeed")
        const btcUsdPriceFeed = await ethers.getContract("BTCUSDPriceFeed")
        const ethUsdPriceFeed = await ethers.getContract("ETHUSDPriceFeed")

        tokenAddresses = [dai.address, wbtc.address, weth.address]
        priceFeedAddresses = [
            daiUsdPriceFeed.address,
            btcUsdPriceFeed.address,
            ethUsdPriceFeed.address,
        ]

        dsceArgs = [tokenAddresses, priceFeedAddresses, decentralizedStablecoinDeployment.address]
    } else {
        const tokenAddress = [
            networkConfig[network.config.chainId]["dai"],
            networkConfig[network.config.chainId]["wbtc"],
            networkConfig[network.config.chainId]["weth"],
        ]
        const priceFeedAddresses = [
            networkConfig[network.config.chainId]["daiUsdPriceFeed"],
            networkConfig[network.config.chainId]["btcUsdPriceFeed"],
            networkConfig[network.config.chainId]["ethUsdPriceFeed"],
        ]
        dsceArgs = [tokenAddress, priceFeedAddresses, decentralizedStablecoinDeployment.address]
    }

    const dscEngineDeployment = await deploy("DSCEngine", {
        from: deployer,
        args: dsceArgs,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    const dsc = await ethers.getContract("DecentralizedStableCoin")
    await dsc.transferOwnership(dscEngineDeployment.address)

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying DSC...")
        await verify(decentralizedStablecoinDeployment.address, dscArgs)

        log("Verifying DSCE...")
        await verify(dscEngineDeployment.address, dsceArgs)
    }
    log("----------------------------------------------------")
}

module.exports.tags = ["all", "decentralizedstablecoin"]
