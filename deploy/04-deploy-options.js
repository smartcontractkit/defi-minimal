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
    const chainId = network.config.chainId

    let priceFeed, dai

    //Setup chainlink & DAI mocks
    if (network.config.chainId == "31337") {
        const DaiEthAggregator = await deployments.get("DAIETHPriceFeed")
        priceFeed = DaiEthAggregator.address
        const Dai = await deployments.get("DAI")
        dai = Dai.address
    } else {
        priceFeed = networkConfig[chainId]["daiEthPriceFeed"]
    }

    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS
    log("----------------------------------------------------")

    //Deploy options contract
    const args = [priceFeed,dai]
    const optionsDeployment = await deploy("Options", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    // Verify deployment    
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(optionsDeployment.address, args)
    }
    log("----------------------------------------------------")

}

module.exports.tags = ["all", "options"]

