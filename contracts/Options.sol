// @notice This contract is in progress!!
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

error TransferFailed();
error NeedsMoreThanZero();
error TokenNotAllowed(address token);
error OptionNotValid(uint256 optionId);

contract Options is ReentrancyGuard, Ownable {
    mapping(address => address) public s_tokenToEthFeed;
    mapping(uint256 => Option) public s_optionIdToOption;
    mapping(address => uint256) public s_accountToRewards;

    uint256 public s_optionCounter;

    enum OptionState {
        Open,
        Bought,
        Cancelled,
        Executed
    }

    event AllowedTokenSet(address indexed token, address indexed priceFeed);
    event OptionListed(
        uint256 indexed optionId,
        address indexed sellar,
        address indexed token,
        uint256 amount,
        uint256 strikePrice,
        uint256 premiumCost,
        uint256 expiration
    );

    struct Option {
        address token;
        address seller;
        uint256 amount;
        uint256 strikePrice;
        uint256 premiumCost;
        uint256 expiration;
        address buyer;
        OptionState optionState;
    }

    function listOption(
        address token,
        uint256 amount,
        uint256 strikePrice,
        uint256 premiumCost,
        uint256 secondsToExpire
    ) external moreThanZero(amount, strikePrice, premiumCost) isAllowedToken(token) {
        s_optionIdToOption[s_optionCounter] = Option(
            token,
            msg.sender,
            amount,
            strikePrice,
            premiumCost,
            block.timestamp + secondsToExpire,
            address(0),
            OptionState.Open
        );
        s_optionCounter++;
        emit OptionListed(
            s_optionCounter,
            token,
            msg.sender,
            amount,
            strikePrice,
            premiumCost,
            block.timestamp + secondsToExpire
        );
        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
    }

    function buyOption(uint256 optionId)
        external
        payable
        optionExists(optionId)
        isValidOpenOption(optionId)
    {
        Option memory option = s_optionIdToOption[optionId];
        require(msg.value > option.premiumCost, "Not enough ETH");
        s_optionIdToOption[optionId].optionState = OptionState.Bought;
        s_optionIdToOption[optionId].buyer = msg.sender;
    }

    function executeOption(uint256 optionId) external payable optionExists(optionId) {
        Option memory option = s_optionIdToOption[optionId];
        require(option.optionState == OptionState.Bought, "Option already bought");
        require(option.expiration > block.timestamp, "Option has expired");
        require(msg.value == option.strikePrice, "Strike price not met");
        // TODO: Finish Function
    }

    // function cancelOption() {}

    // function executeOption() {}

    // function retrieveExpiredFunds() external {}

    // function retrievePayment() external {}

    /*********************************/
    /* Only Owner (or DAO) Functions */
    /*********************************/

    function setAllowedToken(address token, address priceFeed) external onlyOwner {
        s_tokenToEthFeed[token] = priceFeed;
        emit AllowedTokenSet(token, priceFeed);
    }

    /**************/
    /* Modifiers */
    /*************/

    modifier moreThanZero(
        uint256 amount,
        uint256 strikePrice,
        uint256 premiumCost
    ) {
        if (amount <= 0 || strikePrice <= 0 || premiumCost <= 0) revert NeedsMoreThanZero();
        _;
    }

    modifier isAllowedToken(address token) {
        if (s_tokenToEthFeed[token] == address(0)) revert TokenNotAllowed(token);
        _;
    }

    modifier optionExists(uint256 optionId) {
        if (s_optionIdToOption[optionId].seller == address(0)) revert OptionNotValid(optionId);
        _;
    }

    modifier isValidOpenOption(uint256 optionId) {
        if (
            s_optionIdToOption[optionId].optionState != OptionState.Open ||
            s_optionIdToOption[optionId].expiration > block.timestamp ||
            s_optionIdToOption[optionId].buyer == address(0)
        ) revert OptionNotValid(optionId);
        _;
    }
}
