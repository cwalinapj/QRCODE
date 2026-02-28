// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract QRRegistry is ERC721, Ownable {
    struct Record {
        uint8 mode;
        string target;
        string targetType;
        uint64 createdAt;
        uint64 updatedAt;
        uint64 timelockSeconds;
        string pendingTarget;
        uint64 pendingTargetAt;
    }

    uint8 public constant MODE_IMMUTABLE = 0;
    uint8 public constant MODE_UPDATEABLE = 1;

    uint256 public immutable immutableIpfsPriceUSDC = 19e6;
    uint256 public immutable immutableArweavePriceUSDC = 39e6;
    uint256 public immutable updateablePriceUSDC = 59e6;

    IERC20 public immutable usdc;
    address public treasury;

    uint256 public nextTokenId = 1;

    mapping(uint256 => Record) private _records;
    mapping(uint256 => string) private _pendingTargetType;

    event Minted(
        uint256 indexed tokenId,
        address indexed owner,
        uint8 mode,
        string targetType,
        string target
    );

    event TargetProposed(
        uint256 indexed tokenId,
        string newTargetType,
        string newTarget,
        uint64 availableAt
    );

    event TargetUpdated(
        uint256 indexed tokenId,
        string newTargetType,
        string newTarget
    );

    error InvalidMode();
    error InvalidTargetType();
    error InvalidTarget();
    error ImmutableRecord();
    error NotTokenOwner();
    error TimelockRequired();
    error TimelockNotReady();
    error PendingTargetMissing();
    error PaymentFailed();
    error ZeroAddress();
    error TokenNotMinted();

    constructor(address usdcAddress, address treasuryAddress)
        ERC721("QR Forever", "QRF")
        Ownable(msg.sender)
    {
        if (usdcAddress == address(0) || treasuryAddress == address(0)) {
            revert ZeroAddress();
        }
        usdc = IERC20(usdcAddress);
        treasury = treasuryAddress;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
    }

    function mintImmutable(string calldata targetType, string calldata target) external returns (uint256 tokenId) {
        _validateTargetType(targetType);
        _validateTarget(targetType, target);

        bytes32 t = keccak256(bytes(targetType));
        uint256 price = t == keccak256("arweave") ? immutableArweavePriceUSDC : immutableIpfsPriceUSDC;
        _collectUSDC(msg.sender, price);

        tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);

        _records[tokenId] = Record({
            mode: MODE_IMMUTABLE,
            target: target,
            targetType: targetType,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            timelockSeconds: 0,
            pendingTarget: "",
            pendingTargetAt: 0
        });

        emit Minted(tokenId, msg.sender, MODE_IMMUTABLE, targetType, target);
    }

    function mintUpdateable(
        string calldata targetType,
        string calldata target,
        uint64 timelockSeconds
    ) external returns (uint256 tokenId) {
        _validateTarget(targetType, target);
        _validateTargetType(targetType);

        _collectUSDC(msg.sender, updateablePriceUSDC);

        tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);

        _records[tokenId] = Record({
            mode: MODE_UPDATEABLE,
            target: target,
            targetType: targetType,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            timelockSeconds: timelockSeconds,
            pendingTarget: "",
            pendingTargetAt: 0
        });

        emit Minted(tokenId, msg.sender, MODE_UPDATEABLE, targetType, target);
    }

    function updateTarget(
        uint256 tokenId,
        string calldata newTargetType,
        string calldata newTarget
    ) external {
        _requireTokenOwner(tokenId, msg.sender);
        Record storage record = _records[tokenId];

        if (record.mode != MODE_UPDATEABLE) revert ImmutableRecord();
        if (record.timelockSeconds != 0) revert TimelockRequired();

        _validateTargetType(newTargetType);
        _validateTarget(newTargetType, newTarget);

        record.targetType = newTargetType;
        record.target = newTarget;
        record.updatedAt = uint64(block.timestamp);

        emit TargetUpdated(tokenId, newTargetType, newTarget);
    }

    function proposeTarget(
        uint256 tokenId,
        string calldata newTargetType,
        string calldata newTarget
    ) external {
        _requireTokenOwner(tokenId, msg.sender);
        Record storage record = _records[tokenId];

        if (record.mode != MODE_UPDATEABLE) revert ImmutableRecord();
        if (record.timelockSeconds == 0) revert TimelockRequired();

        _validateTargetType(newTargetType);
        _validateTarget(newTargetType, newTarget);

        uint64 availableAt = uint64(block.timestamp) + record.timelockSeconds;

        record.pendingTarget = newTarget;
        record.pendingTargetAt = availableAt;
        _pendingTargetType[tokenId] = newTargetType;

        emit TargetProposed(tokenId, newTargetType, newTarget, availableAt);
    }

    function commitTarget(uint256 tokenId) external {
        _requireTokenOwner(tokenId, msg.sender);
        Record storage record = _records[tokenId];

        if (record.mode != MODE_UPDATEABLE) revert ImmutableRecord();
        if (record.timelockSeconds == 0) revert TimelockRequired();
        if (bytes(record.pendingTarget).length == 0) revert PendingTargetMissing();
        if (uint64(block.timestamp) < record.pendingTargetAt) revert TimelockNotReady();

        string memory nextType = _pendingTargetType[tokenId];
        string memory nextTarget = record.pendingTarget;

        record.targetType = nextType;
        record.target = nextTarget;
        record.updatedAt = uint64(block.timestamp);
        record.pendingTarget = "";
        record.pendingTargetAt = 0;
        _pendingTargetType[tokenId] = "";

        emit TargetUpdated(tokenId, nextType, nextTarget);
    }

    function cancelPendingTarget(uint256 tokenId) external {
        _requireTokenOwner(tokenId, msg.sender);
        Record storage record = _records[tokenId];

        if (record.mode != MODE_UPDATEABLE) revert ImmutableRecord();
        if (record.timelockSeconds == 0) revert TimelockRequired();

        record.pendingTarget = "";
        record.pendingTargetAt = 0;
        _pendingTargetType[tokenId] = "";
    }

    function getRecord(uint256 tokenId)
        external
        view
        returns (Record memory record, string memory pendingTargetType)
    {
        _ensureMinted(tokenId);
        return (_records[tokenId], _pendingTargetType[tokenId]);
    }

    function _collectUSDC(address from, uint256 amount) internal {
        bool ok = usdc.transferFrom(from, treasury, amount);
        if (!ok) revert PaymentFailed();
    }

    function _requireTokenOwner(uint256 tokenId, address caller) internal view {
        _ensureMinted(tokenId);
        if (ownerOf(tokenId) != caller) revert NotTokenOwner();
    }

    function _ensureMinted(uint256 tokenId) internal view {
        if (_ownerOf(tokenId) == address(0)) revert TokenNotMinted();
    }

    function _validateTargetType(string calldata targetType) internal pure {
        bytes32 t = keccak256(bytes(targetType));
        if (t != keccak256("url") && t != keccak256("ipfs") && t != keccak256("arweave") && t != keccak256("address"))
        {
            revert InvalidTargetType();
        }
    }

    function _validateTarget(string calldata targetType, string calldata target) internal pure {
        bytes memory b = bytes(target);
        if (b.length == 0 || b.length > 2048) {
            revert InvalidTarget();
        }

        bytes32 t = keccak256(bytes(targetType));

        if (t == keccak256("url")) {
            _validateHttps(target);
            return;
        }

        if (t == keccak256("ipfs")) {
            _validateIpfs(target);
            return;
        }

        if (t == keccak256("arweave")) {
            _validateArweave(target);
            return;
        }

        if (t == keccak256("address")) {
            _validateAddress(target);
            return;
        }

        revert InvalidTargetType();
    }

    function _validateHttps(string calldata url) internal pure {
        bytes memory b = bytes(url);
        bytes memory prefix = bytes("https://");
        if (b.length <= prefix.length) revert InvalidTarget();
        for (uint256 i = 0; i < prefix.length; i++) {
            if (b[i] != prefix[i]) revert InvalidTarget();
        }
    }

    function _validateIpfs(string calldata target) internal pure {
        bytes memory b = bytes(target);
        bool hasPrefix = _startsWith(target, "ipfs://");

        uint256 idx = hasPrefix ? 7 : 0;
        if (b.length <= idx + 10) revert InvalidTarget();

        for (uint256 i = idx; i < b.length; i++) {
            bytes1 c = b[i];
            if (
                !(c >= 0x30 && c <= 0x39) && // 0-9
                !(c >= 0x41 && c <= 0x5a) && // A-Z
                !(c >= 0x61 && c <= 0x7a)
            ) {
                revert InvalidTarget();
            }
        }
    }

    function _validateArweave(string calldata target) internal pure {
        bytes memory b = bytes(target);
        bool hasPrefix = _startsWith(target, "ar://");

        uint256 idx = hasPrefix ? 5 : 0;
        uint256 len = b.length - idx;
        if (len < 43 || len > 64) revert InvalidTarget();

        for (uint256 i = idx; i < b.length; i++) {
            bytes1 c = b[i];
            if (
                !(c >= 0x30 && c <= 0x39) &&
                !(c >= 0x41 && c <= 0x5a) &&
                !(c >= 0x61 && c <= 0x7a) &&
                c != 0x5f && // _
                c != 0x2d // -
            ) {
                revert InvalidTarget();
            }
        }
    }

    function _validateAddress(string calldata target) internal pure {
        bytes memory b = bytes(target);
        if (b.length != 42) revert InvalidTarget();
        if (b[0] != 0x30 || (b[1] != 0x78 && b[1] != 0x58)) revert InvalidTarget(); // 0x / 0X

        for (uint256 i = 2; i < b.length; i++) {
            bytes1 c = b[i];
            if (
                !(c >= 0x30 && c <= 0x39) && // 0-9
                !(c >= 0x41 && c <= 0x46) && // A-F
                !(c >= 0x61 && c <= 0x66) // a-f
            ) {
                revert InvalidTarget();
            }
        }
    }

    function _startsWith(string calldata source, string memory prefix) internal pure returns (bool) {
        bytes memory s = bytes(source);
        bytes memory p = bytes(prefix);
        if (s.length < p.length) return false;

        for (uint256 i = 0; i < p.length; i++) {
            if (s[i] != p[i]) return false;
        }

        return true;
    }
}
