const networkConfig = {
    default: {
        name: "hardhat",
    },
    31337: {
        name: "localhost",
        daiEthPriceFeed: "0x773616E4d11A78F511299002da57A0a94577F1f4",
        btcEthPriceFeed: "0xdeb288F737066589598e9214E782fa5A8eD689e8",
    },
    4: {
        name: "rinkeby",
        daiEthPriceFeed: "0x74825DbC8BF76CC4e9494d0ecB210f676Efa001D",
        wbtcEthPriceFeed: "0x2431452A0010a43878bF198e170F6319Af6d27F4",
        dai: "0xFab46E002BbF0b4509813474841E0716E6730136", // https://erc20faucet.com/
        wbtc: "0x577D296678535e4903D59A4C929B718e1D575e0A", // https://rinkeby.etherscan.io/token/0x577d296678535e4903d59a4c929b718e1d575e0a#writeContract
        weth: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
        daiUsdPriceFeed: "0x2bA49Aaa16E6afD2a993473cfB70Fa8559B523cF",
        btcUsdPriceFeed: "0xECe365B379E1dD183B20fc5f022230C044d51404",
        ethUsdPriceFeed: "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e",
    },
}

const developmentChains = ["hardhat", "localhost"]
const VERIFICATION_BLOCK_CONFIRMATIONS = 6

module.exports = {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
}
