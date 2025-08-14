// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// USDC token interface with permit functionality
interface IUSDC {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
    function nonces(address owner) external view returns (uint256);
}

/**
 * @title USDCFacilitator
 * @dev Allows users to transfer USDC without sending an on-chain approval transaction
 * using ERC20 permit pattern (EIP-2612) or USDC's non-standard permit method
 */
contract USDCFacilitator is 
    Ownable, 
    ReentrancyGuard 
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // State variables
    IUSDC public immutable usdc;
    address public feeCollector;
    
    // Mapping to track used permit signatures to prevent replay attacks
    mapping(bytes32 => bool) public usedPermits;

    // Events
    event FacilitationExecuted(
        address indexed owner,
        address indexed to,
        uint256 amountSent,
        uint256 feeAmount
    );
    
    event FeeCollectorUpdated(
        address indexed oldCollector,
        address indexed newCollector
    );

    // Custom errors
    error InvalidPermitSignature();
    error PermitAlreadyUsed();
    error PermitExpired();
    error InsufficientBalance();
    error InvalidFeeAmount();
    error InvalidRecipient();
    error ZeroAmount();
    error InvalidFeeCollector();

    /**
     * @dev Constructor - sets the USDC token address and initializes the contract
     * @param _usdc Address of the USDC token contract
     * @param _feeCollector Address that will receive facilitation fees
     */
    constructor(address _usdc, address _feeCollector) Ownable(msg.sender) {
        if (_usdc == address(0) || _feeCollector == address(0)) {
            revert InvalidFeeCollector();
        }
        usdc = IUSDC(_usdc);
        feeCollector = _feeCollector;
    }

    /**
     * @dev Main function to facilitate USDC transfer using permit
     * @param owner Address of the USDC token owner
     * @param to Recipient address for the USDC transfer
     * @param value Total amount of USDC to be transferred (including fee)
     * @param deadline Permit signature deadline
     * @param v Recovery byte of the signature
     * @param r First 32 bytes of the signature
     * @param s Second 32 bytes of the signature
     * @param feeAmount Fee amount to be deducted and sent to feeCollector
     */
    function facilitateTransferWithPermit(
        address owner,
        address to,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256 feeAmount
    ) external nonReentrant {
        // Input validation
        if (owner == address(0) || to == address(0)) revert InvalidRecipient();
        if (value == 0) revert ZeroAmount();
        if (feeAmount >= value) revert InvalidFeeAmount();
        if (block.timestamp > deadline) revert PermitExpired();

        // Create permit hash to prevent replay attacks
        bytes32 permitHash = keccak256(abi.encodePacked(
            owner,
            address(this),
            value,
            deadline,
            v,
            r,
            s
        ));
        
        if (usedPermits[permitHash]) revert PermitAlreadyUsed();
        usedPermits[permitHash] = true;

        // Check owner's balance
        if (usdc.balanceOf(owner) < value) revert InsufficientBalance();

        // Execute permit to approve this contract to spend USDC
        try usdc.permit(owner, address(this), value, deadline, v, r, s) {
            // Permit successful
        } catch {
            revert InvalidPermitSignature();
        }

        // Calculate the amount to send to recipient (total - fee)
        uint256 amountToRecipient = value - feeAmount;

        // Transfer fee to fee collector
        if (feeAmount > 0) {
            usdc.transferFrom(owner, feeCollector, feeAmount);
        }

        // Transfer remaining amount to recipient
        usdc.transferFrom(owner, to, amountToRecipient);

        // Emit event
        emit FacilitationExecuted(owner, to, amountToRecipient, feeAmount);
    }

    /**
     * @dev Alternative function that uses USDC's non-standard permit with nonce
     * @param owner Address of the USDC token owner
     * @param to Recipient address for the USDC transfer
     * @param value Total amount of USDC to be transferred (including fee)
     * @param deadline Permit signature deadline
     * @param v Recovery byte of the signature
     * @param r First 32 bytes of the signature
     * @param s Second 32 bytes of the signature
     * @param feeAmount Fee amount to be deducted and sent to feeCollector
     */
    function facilitateTransferWithNonStandardPermit(
        address owner,
        address to,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256 feeAmount
    ) external nonReentrant {
        // Input validation
        if (owner == address(0) || to == address(0)) revert InvalidRecipient();
        if (value == 0) revert ZeroAmount();
        if (feeAmount >= value) revert InvalidFeeAmount();
        if (block.timestamp > deadline) revert PermitExpired();

        // Get current nonce for additional replay protection
        uint256 nonce = usdc.nonces(owner);
        
        // Create permit hash to prevent replay attacks
        bytes32 permitHash = keccak256(abi.encodePacked(
            owner,
            address(this),
            value,
            deadline,
            nonce,
            v,
            r,
            s
        ));
        
        if (usedPermits[permitHash]) revert PermitAlreadyUsed();
        usedPermits[permitHash] = true;

        // Check owner's balance
        if (usdc.balanceOf(owner) < value) revert InsufficientBalance();

        // Execute permit to approve this contract to spend USDC
        try usdc.permit(owner, address(this), value, deadline, v, r, s) {
            // Permit successful
        } catch {
            revert InvalidPermitSignature();
        }

        // Calculate the amount to send to recipient (total - fee)
        uint256 amountToRecipient = value - feeAmount;

        // Transfer fee to fee collector
        if (feeAmount > 0) {
            usdc.transferFrom(owner, feeCollector, feeAmount);
        }

        // Transfer remaining amount to recipient
        usdc.transferFrom(owner, to, amountToRecipient);

        // Emit event
        emit FacilitationExecuted(owner, to, amountToRecipient, feeAmount);
    }

    /**
     * @dev Update the fee collector address (only owner)
     * @param newFeeCollector New address for fee collection
     */
    function updateFeeCollector(address newFeeCollector) external onlyOwner {
        if (newFeeCollector == address(0)) revert InvalidFeeCollector();
        
        address oldCollector = feeCollector;
        feeCollector = newFeeCollector;
        
        emit FeeCollectorUpdated(oldCollector, newFeeCollector);
    }

    /**
     * @dev Get USDC token decimals for fee calculations
     * @return Number of decimals (should be 6 for USDC)
     */
    function getUSDCDecimals() external view returns (uint8) {
        return usdc.decimals();
    }

    /**
     * @dev Check if a permit signature has been used
     * @param permitHash Hash of the permit parameters
     * @return Boolean indicating if the permit has been used
     */
    function isPermitUsed(bytes32 permitHash) external view returns (bool) {
        return usedPermits[permitHash];
    }

    /**
     * @dev Calculate permit hash for replay attack prevention
     * @param owner Token owner address
     * @param value Amount to permit
     * @param deadline Permit deadline
     * @param v Signature parameter
     * @param r Signature parameter
     * @param s Signature parameter
     * @return Hash of the permit parameters
     */
    function calculatePermitHash(
        address owner,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external view returns (bytes32) {
        return keccak256(abi.encodePacked(
            owner,
            address(this),
            value,
            deadline,
            v,
            r,
            s
        ));
    }

    /**
     * @dev Emergency function to rescue tokens (only owner)
     * @param token Token address to rescue
     * @param to Recipient address
     * @param amount Amount to rescue
     */
    function rescueTokens(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert InvalidRecipient();
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @dev Get contract version
     * @return Version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}