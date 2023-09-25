// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/SignedMath.sol";

import "hardhat/console.sol"; // debug

import "./upgradeable/EIP712CrossChainUpgradeable.sol";
import "./upgradeable/AddressLibUpgradeable.sol";

/**
 * @notice Messaging interface exposed by the Across SpokePool.
 */
interface AcrossMessageHandler {
    function handleAcrossMessage(
        address tokenSent,
        uint256 amount,
        bool fillCompleted,
        address relayer,
        bytes memory message
    ) external;
}

/**
 * @title Gauntlet
 * @notice Relayers run the gauntlet and see whether they get whacked.
 */
contract Gauntlet is AcrossMessageHandler, UUPSUpgradeable, ReentrancyGuardUpgradeable, EIP712CrossChainUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressLibUpgradeable for address;

    address public admin;

    address public spokePool;

    bytes32 public constant AUCTION_HASH = keccak256("auction(uint32 id,uint32 expiry)");
    uint32 public constant MIN_MESSAGE_LENGTH = 4 + 4 + 20 + 65; // auctionId, expiry, recipient, signature

    /****************************************
     *                EVENTS                *
     ****************************************/

    event SignatureVerified(address indexed relayer, bytes signature);
    event FillExecuted(uint32 indexed auctionId, address indexed relayer, uint32 deadline);

    /****************************************
     *               MODIFIERS              *
     ****************************************/

    /**
     * @dev Revert when `msg.sender` is not the admin.
     */
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    /**
     * @dev Revert when `msg.sender` is not the SpokePool.
     */
    modifier onlySpokePool() {
        require(msg.sender == spokePool, "Only SpokePool");
        _;
    }

    /**************************************
     *          ADMIN FUNCTIONS           *
     **************************************/

    /**
     * Do not leave an implementation contract uninitialized.
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Implementation contract initialisation.
     * @param _spokePool SpokePool address.
     */
    function initialize(address _spokePool) public initializer {
        __EIP712_init("RelayerCartel", "0");
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        admin = msg.sender;
        spokePool = _spokePool;
    }

    // Allows cross domain admin to upgrade UUPS proxy implementation.
    function _authorizeUpgrade(address newImplementation) internal override onlyAdmin {}

    /**************************************
     *         RELAYER FUNCTIONS          *
     **************************************/

    // @dev message data is a tightly packed array.
    // @todo Apply "onlySpokePool" modifier to lock down the caller.
    function handleAcrossMessage(
        address tokenSent,
        uint256 amount,
        bool fillCompleted,
        address relayer,
        bytes calldata message
    ) public nonReentrant {
        // @todo Remove magic lengths.
        require(message.length >= MIN_MESSAGE_LENGTH, "Incomplete message");
        uint32 auctionId = uint32(bytes4(message[0:]));
        uint32 expiry = uint32(bytes4(message[4:]));
        address recipient = address(bytes20(message[8:]));

        // If the current timestamp is within the expiry time, require that the
        // relayer is approved by the message data. Otherwise, ignore it.
        if (expiry >= block.timestamp) {
            require(fillCompleted, "No partial fill before expiry");

            bytes memory signature = message[28:93];
            require(_signatureValid(relayer, auctionId, expiry, signature), "Invalid signature");
            emit SignatureVerified(relayer, signature);
        }

        // @todo: Handle unwrap to native token?
        IERC20Upgradeable(tokenSent).safeTransfer(recipient, amount);

        // @todo Remove magic lengths.
        if (address(recipient).isContract() && message.length > MIN_MESSAGE_LENGTH) {
            _relayUserMessage(recipient, tokenSent, amount, fillCompleted, relayer, message[94:]);
        }

        emit FillExecuted(auctionId, relayer, expiry);
    }

    receive() external payable {}

    /**************************************
     *         INTERNAL FUNCTIONS         *
     **************************************/

    function _relayUserMessage(
        address recipient,
        address token,
        uint256 amount,
        bool complete,
        address relayer,
        bytes calldata message
    ) internal {
        AcrossMessageHandler(recipient).handleAcrossMessage(token, amount, complete, relayer, message);
    }

    function _signatureValid(
        address relayer,
        uint32 auctionId,
        uint32 expiry,
        bytes memory signature
    ) internal view returns (bool) {
        // https://eips.ethereum.org/EIPS/eip-712#definition-of-hashstruct
        bytes32 messageHash = _hashTypedDataV4(keccak256(abi.encode(AUCTION_HASH, auctionId, expiry)), block.chainid);
        return SignatureChecker.isValidSignatureNow(relayer, messageHash, signature);
    }
}
