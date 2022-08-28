// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.7;

import "./interfaces/IUniswapV2ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UniswapV2ERC20 is IUniswapV2ERC20, ERC20 {
    error EXPIRED(uint256 deadline, uint256 blockTimestamp);
    error InvalidSignature(address recoveredAddress, address owner);
    bytes32 public override DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant override PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    mapping(address => uint256) public override nonces;

    constructor() ERC20("Uniswap V2", "UNI-V2") {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("Uniswap V2")),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
    }

    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        if (deadline < block.timestamp) revert EXPIRED(deadline, block.timestamp);
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline)
                )
            )
        );
        address recoveredAddress = ecrecover(digest, v, r, s);
        if (recoveredAddress == address(0) || recoveredAddress != owner)
            revert InvalidSignature(recoveredAddress, owner);
        _approve(owner, spender, value);
    }
}
