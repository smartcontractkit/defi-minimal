// @notice This contract is in progress!!
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

///@notice Calls: Let you buy an asset at a set price on a specific date.
///@notice Puts: Let you sell an asset at a set price on a specific date.
///@notice This Smart Contract allows for the buying/writing of Covered Calls & Cash-Secured Puts with ETH as the underlying.
///@notice Covered Call: The seller(writer) transfers ETH for collateral and writes a Covered Call. The buyer pays premium w DAI.
///@notice Covered Call: At expiration, the buyer has right to ETH at strike price if market price is greater than strike price. Settles with DAI.
///@notice Cash-Secured Put: The writer transfers ETH for collateral. Buyer pays premium w DAI.
///@notice Cash-Secured Put: At expiration, if market price less than strike, buyer has right to sell ETH at the strike. Settles w DAI.
///@notice All options have the following properties:
/// Strike price - The price at which the underlying asset can either be bought or sold.
/// Expiry - The date at which the option expires.
/// Premium - The price of the options contract.
///@notice This smart contract supports two strategies for option writer:
///1. Covered Calls - You sell upside on an asset while you hold it for yield, which comes from premium (Netural/Bullish on asset).
///2. Cash-secured Puts - You earn yeild on cash (Bullish).

contract Options is ReentrancyGuard, Ownable {
    AggregatorV3Interface internal daiEthPriceFeed;

    IERC20 dai;

    uint256 public s_optionCounter;

    mapping(address => address) public s_tokenToEthFeed;
    mapping(uint256 => Option) public s_optionIdToOption;
    mapping(address => uint256[]) public s_tradersPosition;

    enum OptionState {
        Open,
        Bought,
        Cancelled,
        Exercised
    }

    enum OptionType {
        Call,
        Put
    }

    struct Option {
        address writer;
        address buyer;
        uint256 amount;
        uint256 strike;
        uint256 premiumDue;
        uint256 expiration;
        uint256 collateral;
        OptionState optionState;
        OptionType optionType;
    }

    ///ERRORS
    error TransferFailed();
    error NeedsMoreThanZero();
    error OptionNotValid(uint256 _optionId);

    ///EVENTS
    event CallOptionOpen(address writer, uint256 amount, uint256 strike, uint256 premium, uint256 expiration, uint256 value);
    event PutOptionOpen(address writer, uint256 amount, uint256 strike, uint256 premium, uint256 expiration, uint256 value);
    event CallOptionBought(address buyer, uint256 id);
    event PutOptionBought(address buyer, uint256 id);
    event CallOptionExercised(address buyer, uint256 id);
    event PutOptionExercised(address buyer, uint256 id);
    event OptionExpiresWorthless(address buyer, uint256 Id);
    event FundsRetrieved(address writer, uint256 id, uint256 value);

    ///@notice CHAINLINK PRICEFEED
    ///Network: Kovan
    ///Aggregator: DAI/ETH
    ///Address: 0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541
    ///Kovan DAI Addr: 0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa
    constructor(address _daiAddr) {
        daiEthPriceFeed = AggregatorV3Interface(0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541);
        dai = IERC20(_daiAddr);
    }

    function writeCallOption(
        uint256 _amount,
        uint256 _strike,
        uint256 _premiumDue,
        uint256 _daysToExpiry
    ) external payable moreThanZero(_amount, _strike, _premiumDue) {
        require(msg.value == _strike, "CALL: NO ETH COLLATERAL");

        s_optionIdToOption[s_optionCounter] = Option(
            msg.sender,
            address(0),
            _amount,
            _strike,
            _premiumDue,
            block.timestamp + _daysToExpiry,
            msg.value,
            OptionState.Open,
            OptionType.Call
        );

        s_tradersPosition[msg.sender].push(s_optionCounter);
        s_optionCounter++;

        emit CallOptionOpen(msg.sender, _amount, _strike, _premiumDue, block.timestamp + _daysToExpiry, msg.value);
    }

    function buyCallOption(uint256 _optionId)
        external
        optionExists(_optionId)
        isValidOpenOption(_optionId)
        nonReentrant
    {
        Option memory option = s_optionIdToOption[_optionId];

        require(option.optionType == OptionType.Call, "NOT A CALL");

        //buyer pays w dai
        bool paid = dai.transferFrom(msg.sender, address(this), option.premiumDue);
        if (!paid) revert TransferFailed();

        //dai transfered to writer
        dai.transfer(option.writer, option.premiumDue);

        s_optionIdToOption[_optionId].buyer = msg.sender;
        s_optionIdToOption[_optionId].optionState = OptionState.Bought;
        s_tradersPosition[msg.sender].push(_optionId);

        emit CallOptionBought(msg.sender, _optionId);
    }

    function writePutOption(
        uint256 _amount,
        uint256 _strike,
        uint256 _premiumDue,
        uint256 _daysToExpiry
    ) external payable moreThanZero(_amount, _strike, _premiumDue) {
        require(msg.value == _strike, "PUT: NO ETH COLLATERAL");

        s_optionIdToOption[s_optionCounter] = Option(
            msg.sender,
            address(0),
            _amount,
            _strike,
            _premiumDue,
            block.timestamp + _daysToExpiry,
            msg.value,
            OptionState.Open,
            OptionType.Put
        );

        s_tradersPosition[msg.sender].push(s_optionCounter);
        s_optionCounter++;

        emit PutOptionOpen(msg.sender, _amount, _strike, _premiumDue, block.timestamp + _daysToExpiry, msg.value);
    }

    function buyPutOption(uint256 _optionId)
        external
        optionExists(_optionId)
        isValidOpenOption(_optionId)
        nonReentrant
    {
        Option memory option = s_optionIdToOption[_optionId];

        require(option.optionType == OptionType.Put, "NOT A PUT");

        //pay premium w dai
        bool paid = dai.transferFrom(msg.sender, address(this), option.premiumDue);
        if (!paid) revert TransferFailed();

        //transfer premium to writer
        dai.transfer(option.writer, option.premiumDue);

        s_optionIdToOption[_optionId].buyer = msg.sender;
        s_optionIdToOption[_optionId].optionState = OptionState.Bought;
        s_tradersPosition[msg.sender].push(_optionId);

        emit CallOptionBought(msg.sender, _optionId);
    }

    function exerciseCallOption(uint256 _optionId)
        external
        payable
        optionExists(_optionId)
        nonReentrant
    {
        Option memory option = s_optionIdToOption[_optionId];

        require(msg.sender == option.buyer, "NOT BUYER");
        require(option.optionState == OptionState.Bought, "NEVER BOUGHT");
        require(option.expiration > block.timestamp, "HAS NOT EXPIRED");

        uint256 marketPrice = option.amount * getPriceFeed();

        require(marketPrice > option.strike, "NOT GREATER THAN STRIKE");

        //buyer gets right to buy ETH at strike w DAI
        bool paid = dai.transferFrom(msg.sender, address(this), option.strike);
        if (!paid) revert TransferFailed();

        //transfer to msg.sender the writer's ETH collateral
        payable(msg.sender).transfer(option.collateral);

        //transfer dai to option writer
        dai.transfer(option.writer, option.strike);
     
        s_optionIdToOption[_optionId].optionState = OptionState.Exercised;

        emit CallOptionExercised(msg.sender, _optionId);
    }

       function exercisePutOption(uint256 _optionId)
        external
        payable
        optionExists(_optionId)
        nonReentrant
    {
        Option memory option = s_optionIdToOption[_optionId];

        require(msg.sender == option.buyer, "NOT BUYER");
        require(option.optionState == OptionState.Bought, "NEVER BOUGHT");
        require(option.expiration > block.timestamp, "HAS NOT EXPIRED");

        uint256 marketPrice = option.amount * getPriceFeed();

        require(marketPrice < option.strike, "NOT LESS THAN STRIKE");

        //buyer gets to sell ETH(gets collateral) for DAI at strike to option writer
        bool paid = dai.transferFrom(msg.sender, address(this), option.strike);
        if (!paid) revert TransferFailed();

        payable(msg.sender).transfer(option.collateral);
        
        //transfer dai to option writer
        dai.transfer(option.writer, option.strike);
     
        s_optionIdToOption[_optionId].optionState = OptionState.Exercised;

        emit PutOptionExercised(msg.sender, _optionId);
    }

    function optionExpiresWorthless(uint256 _optionId) external optionExists(_optionId) {
        Option memory option = s_optionIdToOption[_optionId];

        require(option.optionState == OptionState.Bought, "NEVER BOUGHT");
        require(s_optionIdToOption[_optionId].buyer == msg.sender, "NOT BUYER");
        require(option.expiration > block.timestamp, "NOT EXPIRED");

        uint256 marketPrice = option.amount * getPriceFeed();

        if (option.optionType == OptionType.Call) {

            //For call, if market < strike, call options expire worthless
            require(marketPrice < option.strike, "PRICE NOT LESS THAN STRIKE");
            s_optionIdToOption[_optionId].optionState = OptionState.Cancelled;

        } else {

            //For put, if market > strike, put options expire worthless
            require(marketPrice > option.strike, "PRICE NOT GREATER THAN STRIKE");
            s_optionIdToOption[_optionId].optionState = OptionState.Cancelled;
        }

        emit OptionExpiresWorthless(msg.sender, _optionId);
    }

    function retrieveExpiredFunds(uint256 _optionId) external nonReentrant {
        Option memory option = s_optionIdToOption[_optionId];
        
        require(option.optionState == OptionState.Cancelled);
        require(option.expiration < block.timestamp, "NOT EXPIRED");
        require(msg.sender == option.writer, "NOT WRITER");

        payable(msg.sender).transfer(option.collateral);

        emit FundsRetrieved(msg.sender, _optionId, option.collateral);
    }

    /*********************************/
    /* Oracle (Chainlink) Functions */
    /*********************************/

    function getPriceFeed() public view returns (uint256) {
        (, int256 price, , , ) = daiEthPriceFeed.latestRoundData();
        return (uint256(price)) / 1e18;
    }

    /*********************************/
    /* Only Owner (or DAO) Functions */
    /*********************************/

    // function setAllowedToken(address token, address priceFeed) external onlyOwner {
    //     s_tokenToEthFeed[token] = priceFeed;
    //     emit AllowedTokenSet(token, priceFeed);
    // }

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

    // modifier isAllowedToken(address token) {
    //     if (s_tokenToEthFeed[token] == address(0)) revert TokenNotAllowed(token);
    //     _;
    // }

    modifier optionExists(uint256 optionId) {
        if (s_optionIdToOption[optionId].writer == address(0)) revert OptionNotValid(optionId);
        _;
    }

    modifier isValidOpenOption(uint256 optionId) {
        if (
            s_optionIdToOption[optionId].optionState != OptionState.Open ||
            s_optionIdToOption[optionId].expiration > block.timestamp
            // || s_optionIdToOption[optionId].buyer == address(0)
        ) revert OptionNotValid(optionId);
        _;
    }
}
