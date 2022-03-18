const { network, ethers } = require("hardhat")
const { developmentChains, VERIFICATION_BLOCK_CONFIRMATIONS } = require("../helper-hardhat-config")
const { verify } = require("../helper-functions")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const rewardToken = await deployments.get("RewardToken")
    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS
    log("----------------------------------------------------")
    const args = [rewardToken.address, rewardToken.address]
    const stakingDeployment = await deploy("Staking", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(stakingDeployment.address, args)
    }
    log("----------------------------------------------------")
}

module.exports.tags = ["all", "staking"]
