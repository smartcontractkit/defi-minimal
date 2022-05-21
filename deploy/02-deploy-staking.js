const { network, ethers } = require("hardhat")
const { developmentChains, VERIFICATION_BLOCK_CONFIRMATIONS } = require("../helper-hardhat-config")
const { verify } = require("../helper-functions")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const rewardToken = await ethers.getContract("RewardToken")
    const dai = await deployments.get("DAI")

    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS
    log("----------------------------------------------------")
    const args = [dai.address, rewardToken.address]
    const stakingDeployment = await deploy("Staking", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    // send all the reward tokens to the staking contract
    const totalRewardTokenSupply = await rewardToken.totalSupply()
    await rewardToken.approve(deployer, totalRewardTokenSupply)
    await rewardToken.transferFrom(deployer, stakingDeployment.address, totalRewardTokenSupply)

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(stakingDeployment.address, args)
    }
    log("----------------------------------------------------")
}

module.exports.tags = ["all", "staking"]
