// @notice This contract is in progress!!
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Covered European-Style Options
/// @notice The purpose of this is to be a basic option market implementation. It ignores a lot of option specifis (like the Greeks, for example).
/// This Smart Contract allows for the buying/writing of Covered Calls & Cash-Secured Puts with ETH as the underlying.
/// Calls: Let you buy an asset(underlying) at a set price(the strike) on or after a specific date(expiration).
/// Puts: Let you sell an asset(underlying) at a set price(the strike) on or after a specific date (expiration).
/// Covered Call: The seller(writer) transfers ETH for collateral(the underlying) and writes a Covered Call. The buyer pays premium w DAI.
/// Covered Call: At expiration, the buyer has the right to ETH at strike price if spot(market) price is greater than strike price. Settles with DAI.
/// Cash-Secured Put: The writer transfers ETH for collateral. Buyer pays premium w DAI.
/// Cash-Secured Put: At expiration, if market price less than strike, buyer has right to sell ETH at the strike to the writer. Settles w DAI.
/// All options have the following properties:
/// Strike price - The price at which the underlying asset can either be bought or sold. In this contract the strike == the initial spot price for simplicity.
/// Expiry - The date at which the option expires.
/// Premium - The price of the options contract that buyer pays.
/// This smart contract supports two strategies for the option writer:
/// 1. Covered Calls - You sell upside on ETH while you hold it for yield, which comes from premium (Netural/Bullish on ETH).
/// 2. Cash-secured Puts - You earn yield on ETH (Bullish).

contract Options is ReentrancyGuard, Ownable {

    ///STORAGE///

    AggregatorV3Interface internal daiEthPriceFeed;

    IERC20 dai;

    uint256 public s_optionCounter;

    uint256 public s_optionId;

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

    ///ERRORS///

    error TransferFailed();
    error NeedsMoreThanZero();
    error OptionNotValid(uint256 _optionId);

    ///EVENTS///

    event CallOptionOpen(uint256 id, address writer, uint256 amount, uint256 strike, uint256 premium, uint256 expiration, uint256 value);
    event PutOptionOpen(uint256 id, address writer, uint256 amount, uint256 strike, uint256 premium, uint256 expiration, uint256 value);
    event CallOptionBought(address buyer, uint256 id);
    event PutOptionBought(address buyer, uint256 id);
    event CallOptionExercised(address buyer, uint256 id);
    event PutOptionExercised(address buyer, uint256 id);
    event OptionExpiresWorthless(address buyer, uint256 Id);
    event FundsRetrieved(address writer, uint256 id, uint256 value);
    //event AllowedTokenSet(address token, uint256 price);

    ///@dev CHAINLINK PRICEFEEDS & DAI ADDRESSES
    ///NETWORK: KOVAN
    ///DAI/ETH Address: 0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541
    ///Kovan DAI Addr: 0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa
    ///NETWORK: RINKEBY
    ///DAI/ETH Address: 0x74825DbC8BF76CC4e9494d0ecB210f676Efa001D
    ///Rinkeby DAI Addr: 0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa (faucet token)
    constructor(address _priceFeed, address _daiAddr) {
        daiEthPriceFeed = AggregatorV3Interface(_priceFeed);
        dai = IERC20(_daiAddr);
    }

    ///@dev A seller writes a call option. ETH is sent to contract for collateral.
    ///@param _amount is the number of options to be written.
    ///@param _strike is the price of ETH in DAI. Here, strike == current spot price,(for a Dapp, this'd probably be best deteremined on frontend)
    ///@param _premiumDue the cost of the option call paid by buyer in dai. (For dapp, prob determined on frontend and NOT by the WRITER)
    ///@param _daysToExpiry days until option expires and can then be exercised or cancelled.
    ///@param _daiAmount is the amount of dai
    function writeCallOption(
        uint256 _amount,
        uint256 _strike,
        uint256 _premiumDue,
        uint256 _daysToExpiry,
        uint256 _daiAmount
    ) external payable moreThanZero(_amount, _strike, _premiumDue) {

        //returns x amt of ether for 1 dai...1DAI/xETH
        uint256 marketPriceEthPerOneDai = _amount * getPriceFeed(_daiAmount);
        //returns x amt of dai per 1 eth...1ETH/xDAI
        uint256 marketPriceDaiPerOneEth = _daiAmount /  marketPriceEthPerOneDai;

        //eth sent to contract for collateral MUST equal current spot price (1DAI/xETH)
        require(msg.value == marketPriceEthPerOneDai, "CALL: ETH VALUE MUST EQUAL SPOT PRICE");
        //So, In this contract the strike == the spot price for simplicity.
        require(marketPriceDaiPerOneEth == _strike, "CALL: WRONG ETH COLLATERAL");
        
        s_optionIdToOption[s_optionCounter] = Option(
            payable(msg.sender),
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
        s_optionId = s_optionCounter++;

        emit CallOptionOpen(s_optionId, msg.sender, _amount, _strike, _premiumDue, block.timestamp + _daysToExpiry, msg.value);
    }

    ///@dev Buy an open call option.
    ///@param _optionId would need to be used to access the correct option. Every buyer must have a seller.
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
        paid = dai.transfer(option.writer, option.premiumDue);
        if (!paid) revert TransferFailed();

        s_optionIdToOption[_optionId].buyer = msg.sender;
        s_optionIdToOption[_optionId].optionState = OptionState.Bought;
        s_tradersPosition[msg.sender].push(_optionId);

        emit CallOptionBought(msg.sender, _optionId);
    }

    ///@dev A seller writes a put option. ETH is sent to contract for collateral.
    ///@param _amount is the number of options to be written.
    ///@param _strike is the price of ETH in DAI. Here, strike == current spot price.
    ///@param _premiumDue the cost of the option call paid by buyer (in DAI).
    ///@param _daysToExpiry days until option expires and can then be exercised or cancelled.
    ///@param _daiAmount is the amount of dai
    function writePutOption(
        uint256 _amount,
        uint256 _strike,
        uint256 _premiumDue,
        uint256 _daysToExpiry,
        uint256 _daiAmount
    ) external payable moreThanZero(_amount, _strike, _premiumDue) {

        //returns x amt of ether for 1 dai...1DAI/ETH
        uint256 marketPriceEthPerOneDai = _amount * getPriceFeed(_daiAmount);
        //returns x amt of dai per 1 eth...1ETH/DAI
        uint256 marketPriceDaiPerOneEth = _daiAmount /  marketPriceEthPerOneDai;

        //Eth sent to contract for collateral MUST equal the value of ETH vs DAI.
        require(msg.value == marketPriceEthPerOneDai, "PUT: ETH VALUE MUST EQUAL DAI");
        //So, In this contract the strike == the spot price for simplicity.
        require(marketPriceDaiPerOneEth == _strike, "PUT: WRONG ETH COLLATERAL");

        s_optionIdToOption[s_optionCounter] = Option(
            payable(msg.sender),
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
        s_optionId = s_optionCounter++;

        emit PutOptionOpen(s_optionId, msg.sender, _amount, _strike, _premiumDue, block.timestamp + _daysToExpiry, msg.value);
    }

    ///@dev Buy an open put option.
    ///@param _optionId Would need to be used to access the correct option. Every buyer must have a seller.
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
        paid = dai.transfer(option.writer, option.premiumDue);
        if (!paid) revert TransferFailed();

        s_optionIdToOption[_optionId].buyer = msg.sender;
        s_optionIdToOption[_optionId].optionState = OptionState.Bought;
        s_tradersPosition[msg.sender].push(_optionId);

        emit PutOptionBought(msg.sender, _optionId);
    }

    ///@dev The buyer can exercise a call option at expiration.
    ///@param _optionId would need to be used to access the correct option. Every buyer must have a seller.
    ///@param _daiAmount is the amount of dai
    function exerciseCallOption(uint256 _optionId, uint256 _daiAmount)
        external
        payable
        optionExists(_optionId)
        nonReentrant
    {
        Option memory option = s_optionIdToOption[_optionId];

        require(msg.sender == option.buyer, "NOT BUYER");
        require(option.optionState == OptionState.Bought, "NEVER BOUGHT");
        require(option.expiration < block.timestamp, "HAS NOT EXPIRED");

        //returns # of dai for 1 ETH. Ex: 1 dai = ~0.0002eth in real life right now
        uint256 marketPriceEthPerOneDai = option.amount * getPriceFeed(_daiAmount);
        
        //returns 1 eth = x amt of dai...
        uint256 marketPriceDaiPerOneEth = _daiAmount /  marketPriceEthPerOneDai;

        //If spot < strike, option is worthless
        require(marketPriceDaiPerOneEth > option.strike, "NOT GREATER THAN STRIKE");

        //buyer gets right to buy ETH at strike w DAI
        bool paid = dai.transferFrom(msg.sender, address(this), option.strike);
        if (!paid) revert TransferFailed();

        //transfer to msg.sender the writer's ETH collateral
        require(address(this).balance >= option.collateral, "NOT ENOUGH ETH BALANCE");
        (paid, ) = payable(msg.sender).call{value: option.collateral}("");
        if(!paid) revert TransferFailed();

        //transfer dai to option writer
        paid = dai.transfer(option.writer, option.strike);
        if (!paid) revert TransferFailed();
     
        s_optionIdToOption[_optionId].optionState = OptionState.Exercised;

        emit CallOptionExercised(msg.sender, _optionId);
    }

    ///@dev The buyer can exercise a put option at expiration.
    ///@param _optionId would need to be used to access the correct option. Every buyer must have a seller.
    ///@param _daiAmount is the amount of dai
    function exercisePutOption(uint256 _optionId, uint256 _daiAmount)
        external
        payable
        optionExists(_optionId)
        nonReentrant
    {
        Option memory option = s_optionIdToOption[_optionId];

        require(msg.sender == option.buyer, "NOT BUYER");
        require(option.optionState == OptionState.Bought, "NEVER BOUGHT");
        require(option.expiration < block.timestamp, "HAS NOT EXPIRED");

        //returns # of dai for 1 ETH. Ex: 1 dai = ~0.0002eth in real life right now
        uint256 marketPriceEthPerOneDai = option.amount * getPriceFeed(_daiAmount);

        //returns 1 eth = x amt of dai...
        uint256 marketPriceDaiPerOneEth = _daiAmount /  marketPriceEthPerOneDai;
        
        //if spot > strike, option is worthless
        require(marketPriceDaiPerOneEth < option.strike, "MUST BE LESS THAN STRIKE");

        //buyer gets to sell ETH(gets collateral) for DAI at strike to option writer
        bool paid = dai.transferFrom(msg.sender, address(this), option.strike);
        if (!paid) revert TransferFailed();

        (paid,) = payable(msg.sender).call{value: option.collateral}("");
        if(!paid) revert TransferFailed();

        //transfer dai to option writer
        paid = dai.transfer(option.writer, option.strike);
        if (!paid) revert TransferFailed();
     
        s_optionIdToOption[_optionId].optionState = OptionState.Exercised;

        emit PutOptionExercised(msg.sender, _optionId);
    }

    ///@dev The writer can cancel options that have expired and are worthless
    ///@param _optionId would need to be used to access the correct option. Every buyer must have a seller.
    ///@param _daiAmount is the amount of dai
    function optionExpiresWorthless(uint256 _optionId, uint256 _daiAmount) external optionExists(_optionId) {

        Option memory option = s_optionIdToOption[_optionId];

        require(s_optionIdToOption[_optionId].writer == msg.sender, "NOT WRITER");
        require(option.optionState == OptionState.Bought, "NEVER BOUGHT");
        require(option.expiration <= block.timestamp, "NOT EXPIRED");

        uint256 marketPriceEthPerOneDai = option.amount * getPriceFeed(_daiAmount);

        uint256 marketPriceDaiPerOneEth = _daiAmount /  marketPriceEthPerOneDai;

        if (option.optionType == OptionType.Call) {

            //For call, if spot < strike, call options expire worthless
            require(marketPriceDaiPerOneEth < option.strike, "PRICE NOT LESS THAN STRIKE");
            s_optionIdToOption[_optionId].optionState = OptionState.Cancelled;

        } else {

            //For put, if spot > strike, put options expire worthless
            require(marketPriceDaiPerOneEth > option.strike, "PRICE NOT GREATER THAN STRIKE");
            s_optionIdToOption[_optionId].optionState = OptionState.Cancelled;
        }

        emit OptionExpiresWorthless(msg.sender, _optionId);
    }

    ///@dev If options are worthless(cancelled), then writer can get back ETH collateral
    ///@param _optionId would need to be used to access the correct option. Every buyer must have a seller.
    function retrieveExpiredFunds(uint256 _optionId) external nonReentrant {
        Option memory option = s_optionIdToOption[_optionId];
        
        require(option.optionState == OptionState.Cancelled, "NOT CANCELED");
        require(option.expiration < block.timestamp, "NOT EXPIRED");
        require(msg.sender == option.writer, "NOT WRITER");

        //check contract balance is enough for transfer
        require(address(this).balance >= option.collateral, "NOT ENOUGH ETH");

        //return ETH collateral to writer if options expired worthless(cancelled)
        (bool paid,) = payable(msg.sender).call{value: option.collateral}("");
        if(!paid) revert TransferFailed();

        emit FundsRetrieved(msg.sender, _optionId, option.collateral);
    }

    /*********************************/
    /* Oracle (Chainlink) Functions */
    /*********************************/

    ///@dev get the DaiEthPriceFeed (18 decimals) from Chainlink (look at consrtuctor for contract addresses)
    ///@param _amountInDai the amount of Dai
    function getPriceFeed(uint256 _amountInDai) public view returns (uint256) {
        (, int256 price, , , ) = daiEthPriceFeed.latestRoundData();
        return (uint256(price) * _amountInDai) / 1e18;
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
