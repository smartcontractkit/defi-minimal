const {
    keccak256,
    defaultAbiCoder,
    solidityPack,
    toUtf8Bytes,
    getAddress,
} = require("ethers/lib/utils")
const { bigNumberify } = require("../../../../utils/shared")

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)

const PERMIT_TYPEHASH = keccak256(
    toUtf8Bytes(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    )
)
const getDomainSeparator = (name, tokenAddress, chainId) => {
    return keccak256(
        defaultAbiCoder.encode(
            ["bytes32", "bytes32", "bytes32", "uint256", "address"],
            [
                keccak256(
                    toUtf8Bytes(
                        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                    )
                ),
                keccak256(toUtf8Bytes(name)),
                keccak256(toUtf8Bytes("1")),
                chainId,
                tokenAddress,
            ]
        )
    )
}

const getApprovalDigest = async (token, approve, nonce, deadline, chainId) => {
    const name = await token.name()
    const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address, chainId)
    return keccak256(
        solidityPack(
            ["bytes1", "bytes1", "bytes32", "bytes32"],
            [
                "0x19",
                "0x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    defaultAbiCoder.encode(
                        ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
                        [
                            PERMIT_TYPEHASH,
                            approve.owner,
                            approve.spender,
                            approve.value,
                            nonce,
                            deadline,
                        ]
                    )
                ),
            ]
        )
    )
}

const sortTokensAddresses = (...adddresses) => [...adddresses].sort((t1, t2) => (t1 < t2 ? -1 : 1))
const sortTokens = (...tokens) => [...tokens].sort((t1, t2) => (t1.address < t2.address ? -1 : 1))

const getCreate2Address = (factoryAddress, [tokenA, tokenB], bytecode) => {
    const [token0, token1] = sortTokensAddresses(tokenA, tokenB)
    const create2Inputs = [
        "0xff",
        factoryAddress,
        keccak256(solidityPack(["address", "address"], [token0, token1])),
        keccak256(bytecode),
    ]
    const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join("")}`
    return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`)
}

const encodePrice = (reserve0, reserve1) => {
    return [
        reserve1.mul(bigNumberify(2).pow(112)).div(reserve0),
        reserve0.mul(bigNumberify(2).pow(112)).div(reserve1),
    ]
}

const getAmount = (inputAmount, inputReserve, outputReserve) => {
    // constant product function used for pricing
    const inputAmountLessFees = inputAmount.mul(997).div(1000)
    return inputAmountLessFees.mul(outputReserve).div(inputReserve.add(inputAmountLessFees))
}

module.exports = {
    PERMIT_TYPEHASH,
    getDomainSeparator,
    getApprovalDigest,
    sortTokensAddresses,
    sortTokens,
    getCreate2Address,
    MINIMUM_LIQUIDITY,
    encodePrice,
    getAmount,
}
