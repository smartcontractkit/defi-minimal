Maker has like a billion names for a billion things.

The skinny of it is:
You deposit ETH -> it mints you DAI

List of contract addresses for DAI: https://chainlog.makerdao.com/api/mainnet/active.json
Or with a specific version: https://changelog.makerdao.com/releases/mainnet/1.12.0/contracts.json
red-black coins: https://users.encs.concordia.ca/~clark/papers/2021_defi.pdf


Maker Oracles: [Per here](https://github.com/makerdao/developerguides/blob/master/oracles/oracle-integration-guide.md#oracle-module): The latest contract addresses for each collateral oracle contract can be found in the changelog. Each collateral asset will have a contract address named as PIP_collateralName. For example, for the ETH collateral type, you’ll find the oracle contract as this: PIP_ETH

ETH PIP Contract Address: https://etherscan.io/address/0x81FE72B5A8d1A857d176C3E7d5Bd2679A9B85763#code

Functions:
- `peek`: returns the price
- `peep`: returns the next price
- `read`: returns the price, reverts if price is bad


They read from a DSValue contract like this: https://github.com/dapphub/ds-value/blob/master/src/value.sol <- You can think of this as the "real" price feed contract, and OSM does the logic behind when they get pulled in. 


This is the oracle 👇
This is an EOA (not a contract) that calls `poke` methods: https://etherscan.io/address/0xb3f5130e287e6611323ad263e37ce763d4f129e8. But it could be really anyone since they already have the next price setup. 

Well.. it calls the megapoker which calls the OSM contract that updates the price. 

This contract keeps track of all the "pokers" https://etherscan.io/address/0xea347db6ef446e03745c441c17018ef3d641bc8f#code

## Attack Vectors

Anyone can call the "poke" function and move to the next price. This seems bad. But it showed up! I updated the price! It looks like it uses uniswap as the oracle, and then a set of keepers to call `poke` all the time!

I called poke: 
https://etherscan.io/tx/0x1554dd8ba35d29ad0d4d6cff4c4378bcc91f20ff9b9b648b4361a310dca4ccb7

1. Syncs all the oracle prices on the uniswap oracle
2. Do a transfer on curve? (to get prices?)
3. Then lido?
4. Then it updates all the values in the maker stuff?
