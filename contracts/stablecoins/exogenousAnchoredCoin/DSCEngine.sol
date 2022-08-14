// Based VEEEEEEEEEEERY LOOSELY on the MakerDAO DSS System (Dsc)
// Also has some Aave mixed in

/////////////////////////////////////////////////
/******  We are ignoring the following modules: *********/
// System Stabilizer: We are pretending that our liquidation model is good enough
// (It's definetly not)
// https://docs.makerdao.com/smart-contract-modules/system-stabilizer-module

// Oracle Module:
// We use Chainlink instead
// https://docs.makerdao.com/smart-contract-modules/oracle-module

// MKR Module:
// The MKR Module is for governance and a backstop against becoming insolvent.
// This is crucial for production
// https://docs.makerdao.com/smart-contract-modules/mkr-module

// Governance Module:
// See above
// https://docs.makerdao.com/smart-contract-modules/governance-module

// Rates Module:
// We are removing the rates module because we don't have governance
// We could include it more protection against insolvency, but we are going to pretend (again) that our liquidation thresholds are high enough
// https://docs.makerdao.com/smart-contract-modules/rates-module

// Flash Mint Module
// Not necesary
// https://docs.makerdao.com/smart-contract-modules/flash-mint-module

// Emergency Shutdown Module:
// Because
// https://docs.makerdao.com/smart-contract-modules/shutdown
/////////////////////////////////////////////////

/////////////////////////////////////////////////
/******  Included Modules: *********/

// Core Module
// Collateral Module (but wrapped into one contract)
// Liquidation Module (but wrapped into one contract)

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./DecentralizedStableCoin.sol";
import "hardhat/console.sol";

error DSCEngine__TokenAddressesAndPriceFeedAddressesAmountsDontMatch();
error DSCEngine__NeedsMoreThanZero();
error DSCEngine__TokenNotAllowed(address token);
error DSCEngine__TransferFailed();
error DSCEngine__BreaksHealthFactor();
error DSCEngine__MintFailed();
error DSCEngine__MustBreaksHealthFactor();
error DSCEngine__HealthFactorOk();

contract DSCEngine is ReentrancyGuard {
    uint256 public constant LIQUIDATION_THRESHOLD = 50; // This means you need to be 200% over-collateralized
    uint256 public constant LIQUIDATION_BONUS = 10; // This means you get assets at a 10% discount when liquidating
    uint256 public constant MIN_HEALTH_FACTOR = 1e18;
    DecentralizedStableCoin public immutable i_dsc;

    mapping(address => address) public s_tokenAddressToPriceFeed;
    // user -> token -> amount
    mapping(address => mapping(address => uint256)) public s_userToTokenAddressToAmountDeposited;
    // user -> amount
    mapping(address => uint256) public s_userToDscMinted;
    address[] public s_collateralTokens;

    event CollateralDeposited(address indexed user, uint256 indexed amount);

    modifier moreThanZero(uint256 amount) {
        if (amount == 0) {
            revert DSCEngine__NeedsMoreThanZero();
        }
        _;
    }

    modifier isAllowedToken(address token) {
        if (s_tokenAddressToPriceFeed[token] == address(0)) {
            revert DSCEngine__TokenNotAllowed(token);
        }
        _;
    }

    constructor(
        address[] memory tokenAddresses,
        address[] memory priceFeedAddresses,
        address dscAddress
    ) {
        if (tokenAddresses.length != priceFeedAddresses.length) {
            revert DSCEngine__TokenAddressesAndPriceFeedAddressesAmountsDontMatch();
        }
        // These feeds will be the USD pairs
        // For example ETH / USD or MKR / USD
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            s_tokenAddressToPriceFeed[tokenAddresses[i]] = priceFeedAddresses[i];
            s_collateralTokens.push(tokenAddresses[i]);
        }
        // i_dsc = new DecentralizedStableCoin();
        i_dsc = DecentralizedStableCoin(dscAddress);
    }

    function depositCollateralAndMintDsc(
        address tokenCollateralAddress,
        uint256 amountCollateral,
        uint256 amountDscToMint
    ) external {
        despositCollateral(tokenCollateralAddress, amountCollateral);
        mintDsc(amountDscToMint);
    }

    function despositCollateral(address tokenCollateralAddress, uint256 amountCollateral)
        public
        moreThanZero(amountCollateral)
        nonReentrant
        isAllowedToken(tokenCollateralAddress)
    {
        s_userToTokenAddressToAmountDeposited[msg.sender][
            tokenCollateralAddress
        ] += amountCollateral;
        emit CollateralDeposited(msg.sender, amountCollateral);
        bool success = IERC20(tokenCollateralAddress).transferFrom(
            msg.sender,
            address(this),
            amountCollateral
        );
        if (!success) {
            revert DSCEngine__TransferFailed();
        }
    }

    function redeemCollateralForDsc(
        address tokenCollateralAddress,
        uint256 amountCollateral,
        uint256 amountDscToBurn
    ) external {
        burnDsc(amountDscToBurn);
        redeemCollateral(tokenCollateralAddress, amountCollateral);
    }

    function redeemCollateral(address tokenCollateralAddress, uint256 amountCollateral)
        public
        moreThanZero(amountCollateral)
        nonReentrant
    {
        _redeemCollateral(tokenCollateralAddress, amountCollateral, msg.sender, msg.sender);
        revertIfHealthFactorIsBroken(msg.sender);
    }

    function _redeemCollateral(
        address tokenCollateralAddress,
        uint256 amountCollateral,
        address from,
        address to
    ) private {
        s_userToTokenAddressToAmountDeposited[from][tokenCollateralAddress] -= amountCollateral;
        bool success = IERC20(tokenCollateralAddress).transfer(to, amountCollateral);
        if (!success) {
            revert DSCEngine__TransferFailed();
        }
    }

    // Don't call this function directly, you will just lose money!
    function burnDsc(uint256 amountDscToBurn) public moreThanZero(amountDscToBurn) nonReentrant {
        _burnDsc(amountDscToBurn, msg.sender, msg.sender);
        revertIfHealthFactorIsBroken(msg.sender);
    }

    function _burnDsc(
        uint256 amountDscToBurn,
        address onBehalfOf,
        address dscFrom
    ) private {
        s_userToDscMinted[onBehalfOf] -= amountDscToBurn;
        bool success = i_dsc.transferFrom(dscFrom, address(this), amountDscToBurn);
        if (!success) {
            revert DSCEngine__TransferFailed();
        }
        i_dsc.burn(amountDscToBurn);
    }

    function mintDsc(uint256 amountDscToMint) public moreThanZero(amountDscToMint) nonReentrant {
        s_userToDscMinted[msg.sender] += amountDscToMint;
        revertIfHealthFactorIsBroken(msg.sender);
        bool minted = i_dsc.mint(msg.sender, amountDscToMint);
        if (minted != true) {
            revert DSCEngine__MintFailed();
        }
    }

    function getAccountInformation(address user)
        public
        view
        returns (uint256 totalDscMinted, uint256 collateralValueInUsd)
    {
        totalDscMinted = s_userToDscMinted[user];
        collateralValueInUsd = getAccountCollateralValue(user);
    }

    function healthFactor(address user) public view returns (uint256) {
        (uint256 totalDscMinted, uint256 collateralValueInUsd) = getAccountInformation(user);
        if (totalDscMinted == 0) return 100e18;
        uint256 collateralAdjustedForThreshold = (collateralValueInUsd * LIQUIDATION_THRESHOLD) /
            100;
        return (collateralAdjustedForThreshold * 1e18) / totalDscMinted;
    }

    function getAccountCollateralValue(address user)
        public
        view
        returns (uint256 totalCollateralValueInUsd)
    {
        for (uint256 index = 0; index < s_collateralTokens.length; index++) {
            address token = s_collateralTokens[index];
            uint256 amount = s_userToTokenAddressToAmountDeposited[user][token];
            totalCollateralValueInUsd += getUsdValue(token, amount);
        }
        return totalCollateralValueInUsd;
    }

    function getUsdValue(address token, uint256 amount) public view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(s_tokenAddressToPriceFeed[token]);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        // 1 ETH = 1000 USD
        // The returned value from Chainlink will be 1000 * 1e8
        // Most USD pairs have 8 decimals, so we will just pretend they all do
        // We want to have everything in terms of WEI, so we add 10 zeros at the end
        return ((uint256(price) * 1e10) * amount) / 1e18;

        // 10.000000000000000000 ETH should be:
        // 1,000.000000000000000000 USD
    }

    function getTokenAmountFromUsd(address token, uint256 usdAmountInWei)
        public
        view
        returns (uint256)
    {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(s_tokenAddressToPriceFeed[token]);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        // 1 ETH = 1000 USD
        // The returned value from Chainlink will be 1000 * 1e8
        // Most USD pairs have 8 decimals, so we will just pretend they all do
        return (uint256(price) * 1e10 * 1e18) / usdAmountInWei;
    }

    function revertIfHealthFactorIsBroken(address user) internal view {
        uint256 userHealthFactor = healthFactor(user);
        if (userHealthFactor < MIN_HEALTH_FACTOR) {
            revert DSCEngine__BreaksHealthFactor();
        }
    }

    function liquidate(
        address collateral,
        address user,
        uint256 debtToCover
    ) external {
        uint256 startingUserHealthFactor = healthFactor(user);
        if (startingUserHealthFactor >= MIN_HEALTH_FACTOR) {
            revert DSCEngine__HealthFactorOk();
        }
        uint256 tokenAmountFromDebtCovered = getTokenAmountFromUsd(collateral, debtToCover);
        uint256 bonusCollateral = (tokenAmountFromDebtCovered * LIQUIDATION_BONUS) / 100;
        // Burn DSC equal to debtToCover
        // Figure out how much collateral to recover based on how much burnt
        _redeemCollateral(
            collateral,
            tokenAmountFromDebtCovered + bonusCollateral,
            user,
            msg.sender
        );
        _burnDsc(debtToCover, user, msg.sender);

        uint256 endingUserHealthFactor = healthFactor(user);
        require(startingUserHealthFactor < endingUserHealthFactor);
    }
}

// Found this out by going through tenderly simulator for:
// https://dashboard.tenderly.co/tx/mainnet/0x89decb4ff427f63257f4679b3165f4a4f3701b79e9d29d383bd2565b5616bfb7/debugger?trace=0.0.0

// Calls openLockGemAndDraw(): which combines open, lockGem and draw on the DssProxyActions Contract
// open opens a new cdp (collateralized debt position)
// lockGem deposits collateral (moves LINK tokens) into this GemJoin contract: https://etherscan.io/address/0xdfccaf8fdbd2f4805c174f856a317765b49e4a50#readContract
// draw updates collateral fee rate and calls exit which gives Dsc to user
