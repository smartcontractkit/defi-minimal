const { ethers } = require("hardhat")
const { BigNumber } = require("ethers")

const AddressZero = ethers.constants.AddressZero
const AddressOne = "0x0000000000000000000000000000000000000001"
const toWei = (value) => ethers.utils.parseEther(value.toString())

const fromWei = (value) =>
    ethers.utils.formatEther(typeof value === "string" ? value : value.toString())

const getBalance = ethers.provider.getBalance

const bigNumberify = (value) => BigNumber.from(value)

module.exports = {
    toWei,
    fromWei,
    getBalance,
    bigNumberify,
    AddressZero,
    AddressOne,
}
