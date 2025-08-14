require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Contract ABIs
const FACILITATOR_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "owner", "type": "address"},
      {"internalType": "address", "name": "to", "type": "address"},
      {"internalType": "uint256", "name": "value", "type": "uint256"},
      {"internalType": "uint256", "name": "deadline", "type": "uint256"},
      {"internalType": "uint8", "name": "v", "type": "uint8"},
      {"internalType": "bytes32", "name": "r", "type": "bytes32"},
      {"internalType": "bytes32", "name": "s", "type": "bytes32"},
      {"internalType": "uint256", "name": "feeAmount", "type": "uint256"}
    ],
    "name": "facilitateTransferWithPermit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

// Initialize contract
const facilitatorContract = new ethers.Contract(
  process.env.FACILITATOR_ADDRESS,
  FACILITATOR_ABI,
  adminWallet
);

// Endpoint to execute permit transfer
app.post('/api/execute-permit-transfer', async (req, res) => {
  try {
    const {
      owner,
      to,
      value,
      deadline,
      v,
      r,
      s,
      feeAmount,
      nonce,
      chainId,
      facilitatorAddress,
      tokenAddress
    } = req.body;

    console.log('Received permit transfer request:', {
      owner,
      to,
      value,
      feeAmount,
      deadline,
      nonce,
      chainId
    });

    // Validate required fields
    if (!owner || !to || !value || !deadline || v === undefined || !r || !s || !feeAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    // Validate chain ID
    if (chainId !== parseInt(process.env.CHAIN_ID)) {
      return res.status(400).json({
        success: false,
        error: `Invalid chain ID. Expected ${process.env.CHAIN_ID}, got ${chainId}`
      });
    }

    // Validate contract addresses
    if (facilitatorAddress.toLowerCase() !== process.env.FACILITATOR_ADDRESS.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid facilitator contract address'
      });
    }

    if (tokenAddress.toLowerCase() !== process.env.USDC_ADDRESS.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token address'
      });
    }

    // Check deadline hasn't expired
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp > deadline) {
      return res.status(400).json({
        success: false,
        error: 'Permit deadline has expired'
      });
    }

    console.log('Executing transaction with admin wallet:', adminWallet.address);

    // Execute the transaction
    try {
      // First estimate gas
      const gasEstimate = await facilitatorContract.facilitateTransferWithPermit.estimateGas(
        owner,
        to,
        value,
        deadline,
        v,
        r,
        s,
        feeAmount
      );

      console.log('Gas estimate:', gasEstimate.toString());

      // Execute transaction with 20% buffer on gas
      const tx = await facilitatorContract.facilitateTransferWithPermit(
        owner,
        to,
        value,
        deadline,
        v,
        r,
        s,
        feeAmount,
        {
          gasLimit: gasEstimate * 120n / 100n // 20% buffer
        }
      );

      console.log('Transaction sent:', tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();

      console.log('Transaction confirmed:', {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      });

      return res.json({
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      });

    } catch (txError) {
      console.error('Transaction execution error:', txError);
      
      // Parse error message
      let errorMessage = 'Transaction failed';
      if (txError.reason) {
        errorMessage = txError.reason;
      } else if (txError.message) {
        if (txError.message.includes('InvalidPermitSignature')) {
          errorMessage = 'Invalid permit signature';
        } else if (txError.message.includes('PermitAlreadyUsed')) {
          errorMessage = 'This permit has already been used';
        } else if (txError.message.includes('PermitExpired')) {
          errorMessage = 'Permit has expired';
        } else if (txError.message.includes('InsufficientBalance')) {
          errorMessage = 'Insufficient balance';
        } else if (txError.message.includes('InvalidFeeAmount')) {
          errorMessage = 'Invalid fee amount';
        } else {
          errorMessage = txError.message;
        }
      }

      return res.status(500).json({
        success: false,
        error: errorMessage
      });
    }

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    adminAddress: adminWallet.address,
    facilitatorAddress: process.env.FACILITATOR_ADDRESS,
    chainId: process.env.CHAIN_ID
  });
});

// Get transaction status
app.get('/api/transaction/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      return res.json({
        success: false,
        error: 'Transaction not found or pending'
      });
    }

    return res.json({
      success: true,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    });

  } catch (error) {
    console.error('Error fetching transaction:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Admin wallet address:', adminWallet.address);
  console.log('Facilitator contract:', process.env.FACILITATOR_ADDRESS);
  console.log('Chain ID:', process.env.CHAIN_ID);
});